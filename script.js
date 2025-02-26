document.addEventListener('DOMContentLoaded', function () {
    // Update element references
    const playlistSection = document.getElementById('playlistSection');
    const uploadButton = document.getElementById('uploadButton');
    const uploadArea = document.getElementById('uploadArea');
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
    let isDragging = false;

    // Disable volume slider initially
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
    let currentFile = null;

    // Remove old upload area listeners and add new ones
    uploadButton.addEventListener('click', () => {
        fileInput.click();
    });

    playlistSection.addEventListener('dragover', (e) => {
        e.preventDefault();
        playlistSection.classList.add('highlight');
    });

    playlistSection.addEventListener('dragleave', () => {
        playlistSection.classList.remove('highlight');
    });

    playlistSection.addEventListener('drop', (e) => {
        e.preventDefault();
        playlistSection.classList.remove('highlight');

        const items = e.dataTransfer.items;
        if (items) {
            const audioFiles = [];
            const processEntry = async (entry) => {
                if (entry.isFile) {
                    const file = await new Promise(resolve => entry.file(resolve));
                    if (file.type.startsWith('audio/')) {
                        audioFiles.push(file);
                    }
                } else if (entry.isDirectory) {
                    const reader = entry.createReader();
                    const entries = await new Promise(resolve => reader.readEntries(resolve));
                    for (const entry of entries) {
                        await processEntry(entry);
                    }
                }
            };

            Promise.all(Array.from(items).map(item => processEntry(item.webkitGetAsEntry())))
                .then(() => {
                    if (audioFiles.length > 0) {
                        handleFile(audioFiles[0]);
                        createPlaylist(audioFiles);
                    }
                });
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            // Handle multiple files
            const audioFiles = Array.from(fileInput.files).filter(file => file.type.startsWith('audio/'));
            if (audioFiles.length > 0) {
                // Handle the first audio file initially
                handleFile(audioFiles[0]);

                // Create a playlist of audio files
                createPlaylist(audioFiles);
            }
        }
    });

    playButton.addEventListener('click', togglePlay);

    volumeSlider.addEventListener('input', () => {
        const volumeVal = volumeSlider.value;
        if (gainNode) {
            gainNode.gain.value = volumeVal;
        }

        // Update volume display and icon
        volumeValue.textContent = `${Math.round(volumeVal * 100)}%`;
        updateVolumeIcon(volumeVal);

        // Update mute state
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

    // Add drag functionality to progress knob
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

    // Update progress container click handler
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
            // Unmute
            volumeSlider.value = previousVolume;
            gainNode.gain.value = previousVolume;
            volumeValue.textContent = `${Math.round(previousVolume * 100)}%`;
            updateVolumeIcon(previousVolume);
        } else {
            // Mute
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
            alert('Please select an audio file.');
            return;
        }

        // Update selected state in playlist
        currentFile = file;
        updatePlaylistSelection();

        filenameDisplay.textContent = file.name;

        // Stop any currently playing audio
        if (isPlaying) {
            stopAudio();
        }

        const reader = new FileReader();

        reader.onload = function (e) {
            initAudio(e.target.result);
        };

        reader.readAsArrayBuffer(file);
    }

    function updatePlaylistSelection() {
        // Remove selected class from all items
        document.querySelectorAll('.playlist-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Add selected class to current item
        if (currentFile) {
            const items = document.querySelectorAll('.playlist-item');
            items.forEach(item => {
                if (item.textContent === currentFile.name) {
                    item.classList.add('selected');
                }
            });
        }
    }

    function initAudio(arrayBuffer) {
        // Initialize or reinitialize audio context
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        audioContext.decodeAudioData(arrayBuffer).then(buffer => {
            audioBuffer = buffer;

            // Enable volume slider when media is loaded
            volumeSlider.disabled = false;
            // Update volume icon based on current volume value
            updateVolumeIcon(volumeSlider.value);

            // Create gain node for volume control
            gainNode = audioContext.createGain();
            gainNode.gain.value = isMuted ? 0 : volumeSlider.value;

            // Set up analyser for visualization
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;

            // Update UI
            durationElement.textContent = formatTime(audioBuffer.duration);
            playButton.disabled = false;
            noAudio.style.display = 'none';
            waveformCanvas.style.display = 'block';

            // Draw waveform
            drawWaveform();

            // Reset playback state
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

        // Make canvas resolution match display size
        const dpr = window.devicePixelRatio || 1;
        const rect = waveformCanvas.getBoundingClientRect();
        waveformCanvas.width = rect.width * dpr;
        waveformCanvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        // Clear canvas
        ctx.clearRect(0, 0, rect.width, rect.height);

        // Extract audio data
        const rawData = audioBuffer.getChannelData(0); // Get data from first channel
        const samples = 1000; // Number of samples to display
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

        // Find the maximum value for scaling
        const multiplier = rect.height / Math.max(...audioData) / 2;

        // Draw background
        ctx.fillStyle = '#e0e5ec';
        ctx.fillRect(0, 0, rect.width, rect.height);

        // Draw waveform
        const barWidth = rect.width / samples;
        const center = rect.height / 2;

        // Draw subtle grid lines
        ctx.strokeStyle = 'rgba(163, 177, 198, 0.2)';
        ctx.lineWidth = 1;

        // Horizontal grid lines
        for (let i = 0; i < rect.height; i += 20) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(rect.width, i);
            ctx.stroke();
        }

        // Vertical grid lines
        for (let i = 0; i < rect.width; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, rect.height);
            ctx.stroke();
        }

        // Draw waveform with neumorphic effect
        for (let i = 0; i < audioData.length; i++) {
            const x = i * barWidth;
            const height = audioData[i] * multiplier;

            // Shadow effect above waveform
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillRect(x, center - height - 1, barWidth - 1, 1);

            // Main waveform (upper half)
            ctx.fillStyle = '#4299e1';
            ctx.fillRect(x, center - height, barWidth - 1, height);

            // Shadow effect below waveform
            ctx.fillStyle = 'rgba(163, 177, 198, 0.5)';
            ctx.fillRect(x, center, barWidth - 1, 1);

            // Main waveform (lower half)
            ctx.fillStyle = '#4299e1';
            ctx.fillRect(x, center, barWidth - 1, height);
        }
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

        // Create and connect audio nodes
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;

        audioSource.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Calculate start time and start playback
        if (pausedAt) {
            startTime = audioContext.currentTime - pausedAt;
        } else {
            startTime = audioContext.currentTime;
        }

        audioSource.start(0, pausedAt);
        isPlaying = true;
        playButton.innerHTML = '<i class="fa-solid fa-pause"></i>';

        // Update playback position
        updatePlaybackPosition();

        // Set up animation to update visualizer
        animateWaveform();
    }

    function stopAudio() {
        if (!audioSource) return;

        audioSource.stop();
        pausedAt = audioContext.currentTime - startTime;
        isPlaying = false;
        playButton.innerHTML = '<i class="fa-solid fa-play"></i>';

        // Cancel the animation
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

            // Check if playback reached the end
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

        // Draw background
        ctx.fillStyle = '#e0e5ec';
        ctx.fillRect(0, 0, width, height);

        // Draw subtle grid lines
        ctx.strokeStyle = 'rgba(163, 177, 198, 0.2)';
        ctx.lineWidth = 1;

        // Horizontal grid lines
        for (let i = 0; i < height; i += 20) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
            ctx.stroke();
        }

        // Vertical grid lines
        for (let i = 0; i < width; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
        }

        // Draw waveform
        ctx.lineWidth = 3;

        // Draw shadow (bottom)
        ctx.strokeStyle = 'rgba(163, 177, 198, 0.5)';
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

        // Draw highlight (top)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
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

        // Draw main waveform
        ctx.strokeStyle = '#4299e1';
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

    // Initialize volume display
    volumeValue.textContent = `${Math.round(volumeSlider.value * 100)}%`;

    function createPlaylist(files) {
        const playlistContainer = document.getElementById('playlistContainer');
        playlistContainer.innerHTML = '';

        files.forEach((file) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'playlist-item';
            if (currentFile && file.name === currentFile.name) {
                fileItem.classList.add('selected');
            }
            fileItem.textContent = file.name;

            // Remove mouseover/mouseout events and let CSS handle the hover state
            fileItem.addEventListener('click', () => handleFile(file));
            playlistContainer.appendChild(fileItem);
        });
    }
});