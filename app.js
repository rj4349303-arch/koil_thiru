// Web App Control Script for Temple Invitation Flipbook
document.addEventListener('DOMContentLoaded', () => {
    
    // --- DOM Elements ---
    const splashOverlay = document.getElementById('splash-overlay');
    const zoomViewport = document.getElementById('zoom-viewport');
    const zoomContent = document.getElementById('zoom-content');

    // --- Audio State & Synthesizer (Web Audio API) ---
    let audioCtx = null;
    let soundEnabled = true;

    // Initialize Audio Context on user interaction (safeguard for browser autoplay policies)
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    // Synthesize a golden metallic Temple Bell sound
    function playBellSound() {
        if (!soundEnabled) return;
        initAudio();
        
        const now = audioCtx.currentTime;
        const mainGain = audioCtx.createGain();
        mainGain.gain.setValueAtTime(0, now);
        mainGain.gain.linearRampToValueAtTime(0.4, now + 0.02);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0); // Bell rings for 3 seconds
        mainGain.connect(audioCtx.destination);

        // Mix multiple sine waves to generate metallic bell harmonic resonance
        // Frequencies: Fundamental (440Hz), minor 3rd (523Hz), 5th (659Hz), octave (880Hz), chime strike (1200Hz)
        const freqs = [440, 523.25, 659.25, 880, 1200];
        const gains = [0.3, 0.25, 0.2, 0.15, 0.4];
        const decays = [2.5, 2.0, 1.8, 1.2, 0.15]; // Strike chime decays extremely fast

        freqs.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const oscGain = audioCtx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            
            // Add a slight frequency warbling (vibrato) for realism
            if (idx < 3) {
                const lfo = audioCtx.createOscillator();
                const lfoGain = audioCtx.createGain();
                lfo.frequency.setValueAtTime(5, now); // 5Hz vibrato
                lfoGain.gain.setValueAtTime(2, now); // vibrato depth
                lfo.connect(lfoGain);
                lfoGain.connect(osc.frequency);
                lfo.start(now);
                lfo.stop(now + 3.0);
            }

            oscGain.gain.setValueAtTime(gains[idx], now);
            oscGain.gain.exponentialRampToValueAtTime(0.0001, now + decays[idx]);
            
            osc.connect(oscGain);
            oscGain.connect(mainGain);
            
            osc.start(now);
            osc.stop(now + 3.0);
        });
    }

    // Synthesize a paper rustling/page flip sound effect
    function playFlipSound() {
        if (!soundEnabled) return;
        initAudio();

        const now = audioCtx.currentTime;
        const duration = 0.35; // 350ms flip sound

        // 1. Create a white noise buffer
        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        // 2. Setup filter sweep (bandpass to isolate rustling paper frequencies)
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.setValueAtTime(2.0, now);
        // Sweep frequency from 7000Hz down to 900Hz to simulate the friction easing off
        filter.frequency.setValueAtTime(7000, now);
        filter.frequency.exponentialRampToValueAtTime(900, now + duration);

        // 3. Setup volume envelope
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.0001, now);
        gainNode.gain.linearRampToValueAtTime(0.12, now + 0.04); // Fast fade in
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration); // Smooth decay

        // Connections
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        noise.start(now);
        noise.stop(now + duration);
    }



    // --- PageFlip Library Initialization ---
    let pageFlip = null;

    function initPageFlip() {
        // Base dimensions matching aspect ratio of images (720x1024)
        const baseWidth = 550;
        const baseHeight = 780;
        
        pageFlip = new St.PageFlip(document.getElementById('book'), {
            width: baseWidth,
            height: baseHeight,
            size: 'stretch',
            minWidth: 280,
            maxWidth: 750,
            minHeight: 400,
            maxHeight: 1065,
            showCover: true,
            drawShadow: true,
            flippingTime: 700,
            usePortrait: true,
            useMouseEvents: true,
            mobileScrollSupport: false // Disabled to avoid conflict with zoom/pan gesture handlers
        });

        // Load pages from HTML elements
        pageFlip.loadFromHTML(document.querySelectorAll('.my-page'));

        let lastPageIndex = 0;

        // Event: Flipped Page
        pageFlip.on('flip', (e) => {
            const pageIdx = e.data;
            
            // Audio Feedback selection: metallic bell when opening Cover, paper sweep for rest
            if (lastPageIndex === 0 && pageIdx > 0) {
                playBellSound();
            } else {
                playFlipSound();
            }
            lastPageIndex = pageIdx;
        });

        // Keyboard Navigation Support
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') pageFlip.flipPrev();
            if (e.key === 'ArrowRight') pageFlip.flipNext();
        });
    }

    // --- Zoom and Pan Gestures Implementation ---
    let scale = 1.0;
    let posX = 0;
    let posY = 0;
    
    let startX = 0;
    let startY = 0;
    let startDist = 0;
    let startScale = 1.0;
    
    let isDragging = false;
    let isPinching = false;
    let isMouseDown = false;

    // Apply CSS transformation matrix to the scalable content wrapper
    function applyTransform() {
        zoomContent.style.transform = `scale(${scale}) translate(${posX / scale}px, ${posY / scale}px)`;
        
        // Disable page flip interactions when zoomed in to let user pan smoothly without turning pages
        if (pageFlip) {
            if (scale > 1.01) {
                pageFlip.updateState({ useMouseEvents: false });
            } else {
                pageFlip.updateState({ useMouseEvents: true });
            }
        }
    }

    // Reset zoom and translations back to default
    function resetZoom() {
        scale = 1.0;
        posX = 0;
        posY = 0;
        applyTransform();
    }

    // Get touch distance for multi-touch pinch calculations
    function getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Clamp values to prevent excessive panning out-of-bounds
    function clampPan(val, limit) {
        return Math.max(-limit, Math.min(limit, val));
    }

    // Touch Event Listeners on Viewport
    zoomViewport.addEventListener('touchstart', (e) => {
        // Determine touch count
        if (e.touches.length === 1) {
            // SINGLE FINGER: If zoomed in, handle panning drag. If zoomed out (scale=1), do nothing (allow page flip).
            if (scale > 1.02) {
                isDragging = true;
                startX = e.touches[0].clientX - posX;
                startY = e.touches[0].clientY - posY;
                e.preventDefault(); // Prevents iOS rubber banding/scrolling
            }
        } else if (e.touches.length === 2) {
            // TWO FINGERS: Pinch to zoom. Intercept in all states.
            isPinching = true;
            isDragging = false;
            startDist = getTouchDistance(e.touches);
            startScale = scale;
            e.preventDefault();
        }
    }, { passive: false });

    zoomViewport.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches.length === 1) {
            // Drag pan
            posX = e.touches[0].clientX - startX;
            posY = e.touches[0].clientY - startY;
            
            // Pan boundaries constraints relative to scale
            const limitX = (scale - 1) * (zoomViewport.clientWidth / 2);
            const limitY = (scale - 1) * (zoomViewport.clientHeight / 2);
            posX = clampPan(posX, limitX);
            posY = clampPan(posY, limitY);
            
            applyTransform();
            e.preventDefault();
        } else if (isPinching && e.touches.length === 2) {
            // Pinch Zoom
            const dist = getTouchDistance(e.touches);
            scale = startScale * (dist / startDist);
            
            // Constrain zoom levels between 1.0x and 3.5x
            scale = Math.max(1.0, Math.min(3.5, scale));
            
            if (scale <= 1.02) {
                posX = 0;
                posY = 0;
            } else {
                // Adjust pan limit dynamically during pinch
                const limitX = (scale - 1) * (zoomViewport.clientWidth / 2);
                const limitY = (scale - 1) * (zoomViewport.clientHeight / 2);
                posX = clampPan(posX, limitX);
                posY = clampPan(posY, limitY);
            }
            
            applyTransform();
            e.preventDefault();
        }
    }, { passive: false });

    zoomViewport.addEventListener('touchend', (e) => {
        if (isDragging && e.touches.length === 0) {
            isDragging = false;
        }
        if (isPinching && e.touches.length < 2) {
            isPinching = false;
            // If scale snaps back close to 1.0, fully reset it
            if (scale < 1.05) {
                resetZoom();
            }
        }
    });

    // --- Desktop Mouse Zoom & Pan Support ---
    
    // Zoom via Mouse Scroll Wheel
    zoomViewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        initAudio(); // Warm up audio context on scroll wheel too
        
        const zoomIntensity = 0.15;
        const delta = e.deltaY < 0 ? 1 : -1;
        
        scale += delta * zoomIntensity;
        scale = Math.max(1.0, Math.min(3.5, scale));
        
        if (scale <= 1.02) {
            posX = 0;
            posY = 0;
        } else {
            // Keep panning limits safe
            const limitX = (scale - 1) * (zoomViewport.clientWidth / 2);
            const limitY = (scale - 1) * (zoomViewport.clientHeight / 2);
            posX = clampPan(posX, limitX);
            posY = clampPan(posY, limitY);
        }
        
        applyTransform();
    }, { passive: false });

    // Drag-Pan via Mouse Mouse Events (only active when zoomed)
    zoomViewport.addEventListener('mousedown', (e) => {
        if (scale > 1.02) {
            isMouseDown = true;
            startX = e.clientX - posX;
            startY = e.clientY - posY;
            zoomViewport.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (isMouseDown && scale > 1.02) {
            posX = e.clientX - startX;
            posY = e.clientY - startY;
            
            const limitX = (scale - 1) * (zoomViewport.clientWidth / 2);
            const limitY = (scale - 1) * (zoomViewport.clientHeight / 2);
            posX = clampPan(posX, limitX);
            posY = clampPan(posY, limitY);
            
            applyTransform();
        }
    });

    window.addEventListener('mouseup', () => {
        isMouseDown = false;
        zoomViewport.style.cursor = 'default';
    });

    // Double Click to toggle zoom level on desktop / double tap on mobile
    let lastTap = 0;
    zoomViewport.addEventListener('click', (e) => {
        // Detect double tap
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        
        if (tapLength < 300 && tapLength > 0) {
            // Double Clicked/Tapped
            if (scale > 1.05) {
                resetZoom();
            } else {
                scale = 2.0; // Zoom to 2x on double-tap
                
                // Centering zoom on cursor coordinates relative to viewport
                const rect = zoomViewport.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                
                // Pan offset to center the clicked location
                posX = (zoomViewport.clientWidth / 2 - clickX) * 0.8;
                posY = (zoomViewport.clientHeight / 2 - clickY) * 0.8;
                
                const limitX = (scale - 1) * (zoomViewport.clientWidth / 2);
                const limitY = (scale - 1) * (zoomViewport.clientHeight / 2);
                posX = clampPan(posX, limitX);
                posY = clampPan(posY, limitY);
                
                applyTransform();
            }
            e.preventDefault();
        }
        lastTap = currentTime;
    });



    // Reset zoom on screen size or orientation changes to avoid layout bugs
    window.addEventListener('resize', () => {
        resetZoom();
    });

    // Manage Entrance Splash Overlay (First Page) auto-dismiss and click-dismiss
    let splashDismissed = false;
    let splashTimer = null;

    // Helper to check if all page images are fully loaded before rendering the flipbook
    function preloadImages() {
        const images = document.querySelectorAll('.my-page img');
        const promises = Array.from(images).map(img => {
            if (img.complete) {
                return Promise.resolve();
            }
            return new Promise(resolve => {
                img.addEventListener('load', resolve);
                img.addEventListener('error', resolve); // Resolve anyway to avoid hanging on 404s
            });
        });
        return Promise.all(promises);
    }

    function dismissSplash() {
        if (splashDismissed) return;
        splashDismissed = true;

        if (splashTimer) {
            clearTimeout(splashTimer);
            splashTimer = null;
        }

        // Initialize Web Audio API and play temple bell chime
        initAudio();
        playBellSound();

        // Add hidden class to fade out the overlay
        if (splashOverlay) {
            splashOverlay.classList.add('hidden');
        }

        // Initialize PageFlip book canvas once images are preloaded
        preloadImages().then(() => {
            initPageFlip();
        });
    }

    // Automatically transition to book after 4 seconds
    splashTimer = setTimeout(() => {
        dismissSplash();
    }, 4000);

    // Dismiss splash and transition when user clicks anywhere on the screen
    document.addEventListener('click', (e) => {
        if (!splashDismissed) {
            dismissSplash();
            e.preventDefault();
            e.stopPropagation();
        }
    }, true); // Capture phase captures click before child elements receive it

    document.addEventListener('touchstart', (e) => {
        if (!splashDismissed) {
            dismissSplash();
            e.preventDefault();
            e.stopPropagation();
        }
    }, { capture: true, passive: false });
});
