document.addEventListener('DOMContentLoaded', function () {
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
    let currentFile = null; // Add this line to track current file
    let isDragging = false;

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
                createPlaylist(audioFiles);
                handleFile(audioFiles[0]); // Auto-play first file
                currentFile = audioFiles[0];
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
        const playlistContainer = document.getElementById('playlistContainer');
        playlistContainer.innerHTML = '';

        // Sort files by name alphabetically
        const sortedFiles = [...files].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );

        sortedFiles.forEach((file) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'playlist-item';
            if (currentFile && file.name === currentFile.name) {
                fileItem.classList.add('selected');
            }
            fileItem.textContent = file.name;
            fileItem.addEventListener('click', () => handleFile(file));
            playlistContainer.appendChild(fileItem);
        });
    }

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

        ctx.fillStyle = '#e0e5ec';
        ctx.fillRect(0, 0, rect.width, rect.height);

        const barWidth = rect.width / samples;
        const center = rect.height / 2;

        ctx.strokeStyle = 'rgba(163, 177, 198, 0.2)';
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

        for (let i = 0; i < audioData.length; i++) {
            const x = i * barWidth;
            const height = audioData[i] * multiplier;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillRect(x, center - height - 1, barWidth - 1, 1);

            ctx.fillStyle = '#4299e1';
            ctx.fillRect(x, center - height, barWidth - 1, height);

            ctx.fillStyle = 'rgba(163, 177, 198, 0.5)';
            ctx.fillRect(x, center, barWidth - 1, 1);

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

        ctx.fillStyle = '#e0e5ec';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = 'rgba(163, 177, 198, 0.2)';
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

    volumeValue.textContent = `${Math.round(volumeSlider.value * 100)}%`;
});