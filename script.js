document.addEventListener('DOMContentLoaded', function () {
    // Theme handling
    const themeSelect = document.getElementById('themeSelect');

    // Check for saved theme preference or get system preference
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Set initial theme
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme === 'system' ?
            (systemPrefersDark ? 'dark' : 'light') : savedTheme);
        themeSelect.value = savedTheme;
    } else {
        themeSelect.value = 'system';
        document.documentElement.setAttribute('data-theme', systemPrefersDark ? 'dark' : 'light');
    }

    // Theme change handler
    themeSelect.addEventListener('change', function () {
        const selectedTheme = this.value;
        localStorage.setItem('theme', selectedTheme);

        if (selectedTheme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', systemTheme);
        } else {
            document.documentElement.setAttribute('data-theme', selectedTheme);
        }
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        if (themeSelect.value === 'system') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });

    const fileInput = document.getElementById('fileInput');
    const noAudio = document.getElementById('noAudio');
    const waveformCanvas = document.getElementById('waveform');
    const filenameDisplay = document.getElementById('filenameDisplay');
    const playButton = document.getElementById('playButton');
    const currentTimeElement = document.getElementById('currentTime');
    const durationElement = document.getElementById('duration');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    const volumeIcon = document.getElementById('volumeIcon');
    const progressBar = document.getElementById('progressBar');
    const progressContainer = document.querySelector('.progress-container');
    const progressKnob = document.getElementById('progressKnob');
    const uploadButton = document.getElementById('uploadButton');
    const playlistSection = document.getElementById('playlistSection');
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');
    let currentFile = null; // Add this line to track current file
    let isDragging = false;
    let currentPlaylistIndex = -1;
    let playlist = [];

    volumeSlider.disabled = true;

    let audioContext;
    let audioBuffer;
    let audioSource;
    let analyser;
    let isPlaying = false;
    let startTime = 0;
    let pausedAt = 0;
    let gainNode;
    let animationId;
    let previousVolume = 1;
    let isMuted = false;

    uploadButton.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            const audioFiles = Array.from(fileInput.files).filter(file => file.type.startsWith('audio/'));
            if (audioFiles.length > 0) {
                // Extract folder name using webkitRelativePath (if available)
                const firstFile = audioFiles[0];
                let folderName = "Playlist";
                if (firstFile.webkitRelativePath) {
                    folderName = firstFile.webkitRelativePath.split("/")[0] || folderName;
                }
                // Update playlist header text
                const headerElem = document.querySelector('.playlist-header .marquee-content');
                if (headerElem) {
                    headerElem.textContent = folderName;
                }
                createPlaylist(audioFiles);
                // Removed: handleFile(audioFiles[0]); and currentFile = audioFiles[0];
            }
        }
    });

    playButton.addEventListener('click', togglePlay);

    volumeSlider.addEventListener('input', () => {
        const volumeVal = volumeSlider.value;
        if (gainNode) {
            gainNode.gain.value = volumeVal;
        }

        volumeValue.textContent = `${Math.round(volumeVal * 100)}%`;
        updateVolumeIcon(volumeVal);

        isMuted = volumeVal === 0;
        previousVolume = volumeVal > 0 ? volumeVal : previousVolume;
    });

    volumeIcon.addEventListener('click', toggleMute);

    progressBar.addEventListener('click', (e) => {
        if (audioBuffer) {
            const rect = progressBar.getBoundingClientRect();
            const clickPosition = (e.clientX - rect.left) / rect.width;
            const seekTime = clickPosition * audioBuffer.duration;

            if (isPlaying) {
                stopAudio();
                startTime = audioContext.currentTime - seekTime;
                playAudio();
            } else {
                pausedAt = seekTime;
                updatePlaybackPosition();
            }
        }
    });

    progressKnob.addEventListener('mousedown', (e) => {
        isDragging = true;
        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', stopDrag);
    });

    function handleDrag(e) {
        if (!isDragging) return;

        const rect = progressContainer.getBoundingClientRect();
        let position = (e.clientX - rect.left) / rect.width;
        position = Math.max(0, Math.min(1, position));

        updateProgress(position);
    }

    function stopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', stopDrag);
    }

    function updateProgress(position) {
        if (!audioBuffer) return;

        const time = position * audioBuffer.duration;
        progressBar.value = position * 100;
        progressKnob.style.left = `${position * 100}%`;

        if (isPlaying) {
            stopAudio();
            startTime = audioContext.currentTime - time;
            playAudio();
        } else {
            pausedAt = time;
            updatePlaybackPosition();
        }
    }

    progressContainer.addEventListener('click', (e) => {
        if (audioBuffer) {
            const rect = progressContainer.getBoundingClientRect();
            const position = (e.clientX - rect.left) / rect.width;
            updateProgress(position);
        }
    });

    function toggleMute() {
        if (!gainNode) return;

        if (isMuted) {
            volumeSlider.value = previousVolume;
            gainNode.gain.value = previousVolume;
            volumeValue.textContent = `${Math.round(previousVolume * 100)}%`;
            updateVolumeIcon(previousVolume);
        } else {
            previousVolume = gainNode.gain.value > 0 ? gainNode.gain.value : previousVolume;
            volumeSlider.value = 0;
            gainNode.gain.value = 0;
            volumeValue.textContent = "0%";
            updateVolumeIcon(0);
        }

        isMuted = !isMuted;
    }

    function updateVolumeIcon(volume) {
        const vol = parseFloat(volume);
        if (vol === 0) {
            volumeIcon.className = "fa-solid fa-volume-xmark";
        } else if (vol < 0.34) {
            volumeIcon.className = "fa-solid fa-volume-low";
        } else if (vol < 0.67) {
            volumeIcon.className = "fa-solid fa-volume";
        } else {
            volumeIcon.className = "fa-solid fa-volume-high";
        }
    }

    function handleFile(file) {
        if (!file.type.startsWith('audio/')) {
            return; // Silently ignore non-audio files
        }

        currentFile = file; // Update current file
        filenameDisplay.textContent = file.name;
        updatePlaylistSelection(); // <-- Add this call
        // NEW: trigger marquee on media title to auto-scroll when too long
        initMarquee(filenameDisplay);

        if (isPlaying) {
            stopAudio();
        }

        const reader = new FileReader();

        reader.onload = function (e) {
            initAudio(e.target.result);
        };

        reader.readAsArrayBuffer(file);
        updateNavigationButtons();
    }

    function updatePlaylistSelection() {
        const items = document.querySelectorAll('.playlist-item');
        items.forEach(item => {
            if (item.textContent === currentFile.name) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    function createPlaylist(files) {
        playlist = [...files].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
        const playlistContainer = document.getElementById('playlistContainer');
        playlistContainer.innerHTML = '';

        playlist.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'playlist-item';
            if (currentFile && file.name === currentFile.name) {
                fileItem.classList.add('selected');
                currentPlaylistIndex = index;
            }
            fileItem.textContent = file.name;
            fileItem.addEventListener('click', () => {
                currentPlaylistIndex = index;
                handleFile(file);
                updateNavigationButtons();
            });
            playlistContainer.appendChild(fileItem);
        });
        updateNavigationButtons();
    }

    function updateNavigationButtons() {
        prevButton.disabled = !playlist.length || currentPlaylistIndex <= 0;
        nextButton.disabled = !playlist.length || currentPlaylistIndex >= playlist.length - 1;
    }

    prevButton.addEventListener('click', () => {
        if (currentPlaylistIndex > 0) {
            currentPlaylistIndex--;
            handleFile(playlist[currentPlaylistIndex]);
            updateNavigationButtons();
        }
    });

    nextButton.addEventListener('click', () => {
        if (currentPlaylistIndex < playlist.length - 1) {
            currentPlaylistIndex++;
            handleFile(playlist[currentPlaylistIndex]);
            updateNavigationButtons();
        }
    });

    function initAudio(arrayBuffer) {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        audioContext.decodeAudioData(arrayBuffer).then(buffer => {
            audioBuffer = buffer;

            volumeSlider.disabled = false;
            updateVolumeIcon(volumeSlider.value);

            gainNode = audioContext.createGain();
            gainNode.gain.value = isMuted ? 0 : volumeSlider.value;

            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;

            durationElement.textContent = formatTime(audioBuffer.duration);
            playButton.disabled = false;
            noAudio.style.display = 'none';
            waveformCanvas.style.display = 'block';

            drawWaveform();

            isPlaying = false;
            pausedAt = 0;
            updatePlaybackPosition();
        }).catch(error => {
            console.error('Error decoding audio data', error);
            alert('Error loading audio file.');
        });
    }

    function drawWaveform() {
        const ctx = waveformCanvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = waveformCanvas.getBoundingClientRect();
        waveformCanvas.width = rect.width * dpr;
        waveformCanvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, rect.width, rect.height);

        const rawData = audioBuffer.getChannelData(0);
        const samples = 1000;
        const blockSize = Math.floor(rawData.length / samples);
        const audioData = [];

        for (let i = 0; i < samples; i++) {
            let blockStart = blockSize * i;
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(rawData[blockStart + j] || 0);
            }
            audioData.push(sum / blockSize);
        }

        const multiplier = rect.height / Math.max(...audioData) / 2;
        const currentPosition = isPlaying ? (audioContext.currentTime - startTime) / audioBuffer.duration : pausedAt / audioBuffer.duration;
        const splitIndex = Math.floor(samples * currentPosition);

        // Get computed styles for colors
        const computedStyle = getComputedStyle(document.documentElement);
        const backgroundColor = computedStyle.getPropertyValue('--main-bg').trim();
        const gridColor = computedStyle.getPropertyValue('--dark-shadow').trim();
        const waveformColor = computedStyle.getPropertyValue('--accent-color').trim();

        // Background
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, rect.width, rect.height);

        // Grid
        ctx.strokeStyle = `${gridColor}40`; // 40 is hex for 25% opacity
        ctx.lineWidth = 1;
        for (let i = 0; i < rect.height; i += 20) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(rect.width, i);
            ctx.stroke();
        }
        for (let i = 0; i < rect.width; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, rect.height);
            ctx.stroke();
        }

        const barWidth = rect.width / samples;
        const center = rect.height / 2;

        // Draw waveform in two parts: played and unplayed
        for (let i = 0; i < audioData.length; i++) {
            const x = i * barWidth;
            const height = audioData[i] * multiplier;

            // Set colors based on whether this part has been played
            if (i <= splitIndex) {
                // Played portion
                ctx.fillStyle = `${waveformColor}cc`; // cc is hex for 80% opacity
            } else {
                // Unplayed portion
                ctx.fillStyle = `${waveformColor}4d`; // 4d is hex for 30% opacity
            }

            // Draw upper bar
            ctx.fillRect(x, center - height, barWidth - 1, height);
            // Draw lower bar
            ctx.fillRect(x, center, barWidth - 1, height);
        }

        // Draw position line
        const lineX = rect.width * currentPosition;
        ctx.beginPath();
        ctx.strokeStyle = waveformColor;
        ctx.lineWidth = 2;
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, rect.height);
        ctx.stroke();
    }

    function togglePlay() {
        if (isPlaying) {
            stopAudio();
        } else {
            playAudio();
        }
    }

    function playAudio() {
        if (!audioBuffer) return;

        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;

        audioSource.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(audioContext.destination);

        if (pausedAt) {
            startTime = audioContext.currentTime - pausedAt;
        } else {
            startTime = audioContext.currentTime;
        }

        audioSource.start(0, pausedAt);
        isPlaying = true;
        playButton.innerHTML = '<i class="fa-solid fa-pause"></i>';

        updatePlaybackPosition();

        animateWaveform();
    }

    function stopAudio() {
        if (!audioSource) return;

        audioSource.stop();
        pausedAt = audioContext.currentTime - startTime;
        isPlaying = false;
        playButton.innerHTML = '<i class="fa-solid fa-play"></i>';

        cancelAnimationFrame(animationId);
    }

    function updatePlaybackPosition() {
        if (!audioBuffer) return;

        if (isPlaying) {
            const playbackTime = Math.min(audioContext.currentTime - startTime, audioBuffer.duration);
            const position = playbackTime / audioBuffer.duration;

            currentTimeElement.textContent = formatTime(playbackTime);
            progressBar.value = position * 100;
            progressKnob.style.left = `${position * 100}%`;

            drawWaveform(); // Add this line to update waveform

            if (playbackTime >= audioBuffer.duration) {
                stopAudio();
                pausedAt = 0;
                updatePlaybackPosition();
                return;
            }

            requestAnimationFrame(updatePlaybackPosition);
        } else {
            const position = pausedAt / audioBuffer.duration;
            currentTimeElement.textContent = formatTime(pausedAt);
            progressBar.value = position * 100;
            progressKnob.style.left = `${position * 100}%`;
            drawWaveform(); // Add this line to update waveform
        }
    }

    function animateWaveform() {
        if (!isPlaying) return;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);

        const canvas = waveformCanvas;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const center = height / 2;

        ctx.clearRect(0, 0, width, height);

        // Get computed styles for colors
        const computedStyle = getComputedStyle(document.documentElement);
        const backgroundColor = computedStyle.getPropertyValue('--main-bg').trim();
        const gridColor = computedStyle.getPropertyValue('--dark-shadow').trim();
        const waveformColor = computedStyle.getPropertyValue('--accent-color').trim();

        // Background
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        // Grid
        ctx.strokeStyle = `${gridColor}40`;
        ctx.lineWidth = 1;

        for (let i = 0; i < height; i += 20) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
            ctx.stroke();
        }

        for (let i = 0; i < width; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
        }

        ctx.lineWidth = 3;

        ctx.strokeStyle = `${gridColor}80`;
        ctx.beginPath();

        const sliceWidth = width / dataArray.length;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * center;

            if (i === 0) {
                ctx.moveTo(x, y + 2);
            } else {
                ctx.lineTo(x, y + 2);
            }

            x += sliceWidth;
        }

        ctx.lineTo(width, center + 2);
        ctx.stroke();

        ctx.strokeStyle = `${waveformColor}40`;
        ctx.beginPath();

        x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * center;

            if (i === 0) {
                ctx.moveTo(x, y - 2);
            } else {
                ctx.lineTo(x, y - 2);
            }

            x += sliceWidth;
        }

        ctx.lineTo(width, center - 2);
        ctx.stroke();

        ctx.strokeStyle = waveformColor;
        ctx.beginPath();

        x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * center;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        ctx.lineTo(width, center);
        ctx.stroke();

        animationId = requestAnimationFrame(animateWaveform);
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    volumeValue.textContent = `${Math.round(volumeSlider.value * 100)}%`;

    initMarquees();

    const playlistObserver = new MutationObserver(initMarquees);
    playlistObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Add drag and drop event handlers
    playlistSection.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        playlistSection.classList.add('highlight');
    });

    playlistSection.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        playlistSection.classList.remove('highlight');
    });

    playlistSection.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        playlistSection.classList.remove('highlight');

        const items = e.dataTransfer.items;
        if (items) {
            // Use DataTransferItemList interface to access the files
            const entries = [...items]
                .filter(item => item.kind === 'file')
                .map(item => item.webkitGetAsEntry());

            handleFileEntries(entries);
        }
    });

    async function handleFileEntries(entries) {
        const audioFiles = [];
        let folderName = "Playlist";

        // Function to recursively get files from directories
        async function traverseEntries(entry) {
            if (entry.isFile) {
                return new Promise(resolve => {
                    entry.file(file => {
                        if (file.type.startsWith('audio/')) {
                            audioFiles.push(file);
                        }
                        resolve();
                    });
                });
            } else if (entry.isDirectory) {
                folderName = entry.name; // Use the first directory name
                const reader = entry.createReader();
                return new Promise(resolve => {
                    reader.readEntries(async entries => {
                        const promises = entries.map(e => traverseEntries(e));
                        await Promise.all(promises);
                        resolve();
                    });
                });
            }
        }

        // Process all entries
        await Promise.all(entries.map(entry => traverseEntries(entry)));

        if (audioFiles.length > 0) {
            // Update playlist header
            const headerElem = document.querySelector('.playlist-header .marquee-content');
            if (headerElem) {
                headerElem.textContent = folderName;
            }
            createPlaylist(audioFiles);
        }
    }
});

function initMarquee(container) {
    if (!container) return;

    const content = container.querySelector('.marquee-content');
    if (!content) return;

    // Create wrapper if it doesn't exist
    let wrapper = container.querySelector('.text-container');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'text-container';
        content.parentNode.insertBefore(wrapper, content);
        wrapper.appendChild(content);
    }

    const checkOverflow = () => {
        // Remove existing animation
        content.classList.remove('scrolling');
        content.style.removeProperty('--scroll-distance');
        content.style.removeProperty('--duration');

        // Check if content overflows
        if (content.scrollWidth > wrapper.clientWidth) {
            const scrollDistance = -(content.scrollWidth - wrapper.clientWidth);
            // Calculate duration based on content length (50px per second)
            const duration = Math.abs(scrollDistance) / 50;

            content.style.setProperty('--scroll-distance', `${scrollDistance}px`);
            content.style.setProperty('--duration', `${duration}s`);
            content.classList.add('scrolling');
        }
    };

    // Initial check
    checkOverflow();

    // Recheck on window resize
    window.addEventListener('resize', checkOverflow);

    // Recheck when content changes
    new MutationObserver(checkOverflow).observe(content, {
        childList: true,
        characterData: true,
        subtree: true
    });
}

// Replace the old autoScrollMarquee function
function initMarquees() {
    const containers = document.querySelectorAll('.playlist-header, .filename');
    containers.forEach(initMarquee);
}