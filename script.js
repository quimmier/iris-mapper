document.addEventListener('DOMContentLoaded', function() {
    // Element References
    const singleMapperContainer = document.getElementById('single-mapper-container');
    const dualMapperContainer = document.getElementById('dual-mapper-container');
    const imageContainer = document.getElementById('image-container');
    const svgContainer = document.getElementById('svg-container');
    const leftImageContainer = document.getElementById('left-image-container');
    const rightImageContainer = document.getElementById('right-image-container');
    const leftSvgContainer = document.getElementById('left-svg-container');
    const rightSvgContainer = document.getElementById('right-svg-container');
    const imageUpload = document.getElementById('imageUpload');
    const opacitySlider = document.getElementById('opacitySlider');
    const mapColor = document.getElementById('mapColor');
    const mapModal = document.getElementById('mapModal');
    const mapOptions = document.getElementById('mapOptions');
    const closeBtn = document.getElementsByClassName('close')[0];
    const histogramCanvas = document.getElementById('histogramCanvas');
    const histogramCtx = histogramCanvas.getContext('2d', { willReadFrequently: true });
    const galleryAccordion = document.getElementById('galleryAccordion');
    const progressIndicator = document.getElementById('progressIndicator');
    const controls = document.querySelectorAll('.controls');
    const availableMaps = ['Angerer_DE_01', 'Bourdil_FR_01', 'IrisLAB_EN_02', 'IrisLAB_FR_02', 'Jaussas_FR_01', 'Jensen_EN_01', 'Jensen_FR_01', 'Roux_FR_01'];

    const adjustmentSliders = {
        exposure: document.getElementById('exposureSlider'),
        contrast: document.getElementById('contrastSlider'),
        saturation: document.getElementById('saturationSlider'),
        hue: document.getElementById('hueSlider'),
        blur: document.getElementById('blurSlider'),
        shadows: document.getElementById('shadowsSlider'),
        highlights: document.getElementById('highlightsSlider'),
        temperature: document.getElementById('temperatureSlider'),
        sharpness: document.getElementById('sharpnessSlider')
    };

    // State Management
    let currentEye = 'L';
    let isDualViewActive = false;
    let images = { 'L': null, 'R': null };
    let imageSettings = {
        'L': initializeEyeSettings(),
        'R': initializeEyeSettings()
    };
    let svgSettings = {
        'L': {
            svgContent: '',
            mapColor: '#000000',
            opacity: 0.7,
        },
        'R': {
            svgContent: '',
            mapColor: '#000000',
            opacity: 0.7,
        }
    };
    
    // Map Tracking
    let currentMap = availableMaps[0]; // Initialize with the default map
    let customSvgContent = ''; // To store custom SVG content

    // Histogram Optimization
    let histogramUpdatePending = false;
    let lastHistogramUpdate = 0;
    const HISTOGRAM_THROTTLE = 100;
    const SAMPLING_RATE = 4; // Process every 4th pixel for performance

    function initializeEyeSettings() {
        return {
            rotation: 0,
            scale: 1,
            translateX: 0,
            translateY: 0,
            skewX: 0,
            skewY: 0,
            adjustments: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                hue: 0,
                blur: 0,
                shadows: 0,
                highlights: 0,
                temperature: 0,
                sharpness: 0
            },
            canvas: null,
            context: null,
            image: null,
            controlPoints: []
        };
    }

    // Enhanced histogram calculation
    function calculateHistogram(imageData, width, height) {
        const data = imageData.data;
        const red = new Uint32Array(256).fill(0);
        const green = new Uint32Array(256).fill(0);
        const blue = new Uint32Array(256).fill(0);
        
        // Process in chunks with sampling for better performance
        for (let i = 0; i < data.length; i += 4 * SAMPLING_RATE) {
            red[data[i]]++;
            green[data[i + 1]]++;
            blue[data[i + 2]]++;
        }

        return { red, green, blue };
    }

    function drawHistogram(histogramData) {
        const width = histogramCanvas.width;
        const height = histogramCanvas.height;
        
        histogramCtx.clearRect(0, 0, width, height);
        
        const channels = [
            { data: histogramData.red, color: 'rgba(255,0,0,0.5)' },
            { data: histogramData.green, color: 'rgba(0,255,0,0.5)' },
            { data: histogramData.blue, color: 'rgba(0,0,255,0.5)' }
        ];
        
        const maxCount = Math.max(
            Math.max(...histogramData.red),
            Math.max(...histogramData.green),
            Math.max(...histogramData.blue)
        );

        channels.forEach(channel => {
            histogramCtx.beginPath();
            histogramCtx.strokeStyle = channel.color;
            histogramCtx.lineWidth = 2;
            
            for (let i = 0; i < 256; i++) {
                const x = (i / 255) * width;
                const y = height - (channel.data[i] / maxCount * height);
                
                if (i === 0) histogramCtx.moveTo(x, y);
                else histogramCtx.lineTo(x, y);
            }
            
            histogramCtx.stroke();
        });
    }

    function updateHistogram() {
        const settings = isDualViewActive ? imageSettings['L'] : imageSettings[currentEye];
        if (!settings.canvas || histogramUpdatePending) return;

        const now = Date.now();
        if (now - lastHistogramUpdate < HISTOGRAM_THROTTLE) {
            requestAnimationFrame(() => updateHistogram());
            return;
        }

        histogramUpdatePending = true;

        // Create smaller version for histogram calculation
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        const scaleFactor = Math.min(1, 512 / Math.max(settings.canvas.width, settings.canvas.height));
        tempCanvas.width = settings.canvas.width * scaleFactor;
        tempCanvas.height = settings.canvas.height * scaleFactor;

        tempCtx.drawImage(settings.canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

        requestAnimationFrame(() => {
            const histogramData = calculateHistogram(imageData, tempCanvas.width, tempCanvas.height);
            drawHistogram(histogramData);
            histogramUpdatePending = false;
            lastHistogramUpdate = now;
        });
    }

    function setupEnhancedAdjustmentControls() {
        Object.entries(adjustmentSliders).forEach(([adjustment, slider]) => {
            if (!slider) return;

            const container = slider.parentElement;
            const valueDisplay = container.querySelector('.adjustment-value');
            let updateTimeout;

            function updateWithDebounce(value) {
                if (!valueDisplay || !imageSettings[currentEye]) return;
                
                valueDisplay.textContent = value;
                imageSettings[currentEye].adjustments[adjustment] = parseFloat(value);
                
                clearTimeout(updateTimeout);
                updateTimeout = setTimeout(() => {
                    requestAnimationFrame(() => {
                        updateCanvasImage(currentEye);
                    });
                }, 50);
            }

            function updateImmediate(value) {
                if (!valueDisplay || !imageSettings[currentEye]) return;
                
                clearTimeout(updateTimeout);
                valueDisplay.textContent = value;
                imageSettings[currentEye].adjustments[adjustment] = parseFloat(value);
                requestAnimationFrame(() => {
                    updateCanvasImage(currentEye);
                });
            }

            // Slider events with optimized handling
            slider.addEventListener('input', (e) => updateWithDebounce(e.target.value));
            slider.addEventListener('change', (e) => updateImmediate(e.target.value));

            // Add arrow controls if they exist
            const arrows = container.querySelectorAll('.arrow-btn');
            arrows.forEach(arrow => {
                const isUp = arrow.classList.contains('up');
                const step = parseFloat(slider.step) || 1;
                
                arrow.addEventListener('click', () => {
                    const currentValue = parseFloat(slider.value);
                    const newValue = isUp ? 
                        Math.min(currentValue + step, slider.max) : 
                        Math.max(currentValue - step, slider.min);
                    
                    slider.value = newValue;
                    updateImmediate(newValue);
                });
            });
        });
    }

    function makeElementDraggable(element) {
        let isDragging = false;
        let startX, startY;
        let initialX, initialY;

        element.addEventListener('mousedown', function(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') {
                return;
            }
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            element.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            e.preventDefault();
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            element.style.left = `${initialX + dx}px`;
            element.style.top = `${initialY + dy}px`;
        });

        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                element.style.cursor = 'move';
            }
        });
    }

    function setupImageInteraction(canvas, eye) {
        let isDragging = false;
        let isRotating = false;
        let startX, startY;
        let startTranslateX, startTranslateY;
        let startRotation = 0;

        canvas.style.cursor = 'grab';

        function handleDragStart(e) {
            e.preventDefault();
            if (e.button === 2) {
                isRotating = true;
                startX = e.clientX;
                const settings = imageSettings[eye];
                startRotation = settings.rotation;
            } else if (e.button === 0) {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                const settings = imageSettings[eye];
                startTranslateX = settings.translateX;
                startTranslateY = settings.translateY;
            }
            canvas.style.cursor = 'grabbing';
        }

        function handleDragMove(e) {
            if (!isDragging && !isRotating) return;
            e.preventDefault();

            if (isRotating) {
                const dx = e.clientX - startX;
                const settings = imageSettings[eye];
                settings.rotation = startRotation + dx * 0.5;
                requestAnimationFrame(() => {
                    updateCanvasTransform(eye);
                });
            } else if (isDragging) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                const settings = imageSettings[eye];
                settings.translateX = startTranslateX + dx;
                settings.translateY = startTranslateY + dy;
                requestAnimationFrame(() => {
                    updateCanvasTransform(eye);
                });
            }
        }

        function handleDragEnd() {
            if (isDragging || isRotating) {
                isDragging = false;
                isRotating = false;
                canvas.style.cursor = 'grab';
            }
        }

        function handleWheel(e) {
            e.preventDefault();
            const delta = e.deltaY * -0.0005;
            const settings = imageSettings[eye];
            
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const newScale = Math.max(0.1, Math.min(10, settings.scale * Math.exp(delta)));
            const scaleChange = newScale / settings.scale;
            
            settings.translateX = x - (x - settings.translateX) * scaleChange;
            settings.translateY = y - (y - settings.translateY) * scaleChange;
            settings.scale = newScale;
            
            requestAnimationFrame(() => {
                updateCanvasTransform(eye);
            });
        }

        canvas.addEventListener('mousedown', handleDragStart);
        canvas.addEventListener('mousemove', handleDragMove);
        canvas.addEventListener('mouseup', handleDragEnd);
        canvas.addEventListener('mouseleave', handleDragEnd);
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    function createCanvasForEye(eye) {
        const settings = imageSettings[eye];
        if (!settings.image) return;

        if (settings.canvas) {
            // If canvas already exists, remove it to prevent duplicates
            settings.canvas.remove();
        }

        settings.canvas = document.createElement('canvas');
        settings.context = settings.canvas.getContext('2d', { willReadFrequently: true });
        settings.canvas.className = 'image-canvas';
        settings.canvas.width = settings.image.naturalWidth;
        settings.canvas.height = settings.image.naturalHeight;
        settings.canvas.style.position = 'absolute';
        settings.canvas.style.top = '50%';
        settings.canvas.style.left = '50%';
        settings.canvas.style.transform = 'translate(-50%, -50%)';
        setupImageInteraction(settings.canvas, eye);
    }

    function updateCanvasImage(eye) {
        const settings = imageSettings[eye];
        if (!settings.canvas || !settings.context || !settings.image) return;

        const ctx = settings.context;
        const canvas = settings.canvas;
        const img = settings.image;

        // Store original dimensions
        const width = img.naturalWidth;
        const height = img.naturalHeight;

        // Reset canvas dimensions and clear
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);

        // Apply basic adjustments
        ctx.save();
        ctx.filter = `
            brightness(${(100 + settings.adjustments.exposure) / 100})
            contrast(${(100 + settings.adjustments.contrast) / 100})
            saturate(${(100 + settings.adjustments.saturation) / 100})
            hue-rotate(${settings.adjustments.hue}deg)
            blur(${settings.adjustments.blur}px)
        `;

        // Draw image with basic adjustments
        ctx.drawImage(img, 0, 0);

        // Apply advanced adjustments
        if (settings.adjustments.shadows !== 0 || 
            settings.adjustments.highlights !== 0 || 
            settings.adjustments.temperature !== 0 || 
            settings.adjustments.sharpness !== 0) {
            applyAdvancedAdjustments(ctx, canvas, settings);
        }

        ctx.restore();
        updateCanvasTransform(eye);
        
        // Schedule histogram update
        requestAnimationFrame(() => {
            updateHistogram();
        });
    }

    function applyAdvancedAdjustments(ctx, canvas, settings) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const length = data.length;

        // Store original data if sharpness is needed
        let originalData = null;
        if (settings.adjustments.sharpness > 0) {
            originalData = new Uint8ClampedArray(data);
        }

        // Process in chunks for better performance
        const chunkSize = 16384; // Process 4096 pixels at a time
        for (let i = 0; i < length; i += chunkSize) {
            const endIndex = Math.min(i + chunkSize, length);
            processImageChunk(data, i, endIndex, settings.adjustments);
        }

        // Apply sharpening if needed
        if (settings.adjustments.sharpness > 0 && originalData) {
            applySharpening(imageData, originalData, settings.adjustments.sharpness);
        }

        ctx.putImageData(imageData, 0, 0);
    }

    function processImageChunk(data, start, end, adjustments) {
        for (let i = start; i < end; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Calculate luminance only once
            const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            // Shadows adjustment
            if (adjustments.shadows !== 0 && luminance < 128) {
                const shadowFactor = (adjustments.shadows / 100) + 1;
                r = Math.min(255, r * shadowFactor);
                g = Math.min(255, g * shadowFactor);
                b = Math.min(255, b * shadowFactor);
            }

            // Highlights adjustment
            if (adjustments.highlights !== 0 && luminance > 128) {
                const highlightFactor = 1 - (adjustments.highlights / 100);
                r = Math.min(255, r * highlightFactor);
                g = Math.min(255, g * highlightFactor);
                b = Math.min(255, b * highlightFactor);
            }

            // Temperature adjustment
            if (adjustments.temperature !== 0) {
                const tempFactor = adjustments.temperature / 100 * 50;
                r = Math.min(255, r + tempFactor);
                b = Math.min(255, b - tempFactor);
            }

            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
        }
    }

    function applySharpening(imageData, originalData, sharpness) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const factor = sharpness / 50; // Normalize sharpness value

        const kernel = [
            0, -1 * factor, 0,
            -1 * factor, 1 + 4 * factor, -1 * factor,
            0, -1 * factor, 0
        ];

        // Process the image avoiding edges
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                let r = 0, g = 0, b = 0;

                // Apply convolution kernel
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const kernelIdx = (ky + 1) * 3 + (kx + 1);
                        const dataIdx = ((y + ky) * width + (x + kx)) * 4;
                        
                        r += originalData[dataIdx] * kernel[kernelIdx];
                        g += originalData[dataIdx + 1] * kernel[kernelIdx];
                        b += originalData[dataIdx + 2] * kernel[kernelIdx];
                    }
                }

                data[idx] = Math.min(255, Math.max(0, r));
                data[idx + 1] = Math.min(255, Math.max(0, g));
                data[idx + 2] = Math.min(255, Math.max(0, b));
            }
        }
    }

    function updateCanvasTransform(eye) {
        const settings = imageSettings[eye];
        if (!settings.canvas) return;

        settings.canvas.style.transform = `
            translate(-50%, -50%)
            translate(${settings.translateX}px, ${settings.translateY}px)
            rotate(${settings.rotation}deg)
            scale(${settings.scale})
            skew(${settings.skewX}deg, ${settings.skewY}deg)
        `;
    }

    function loadImageForSpecificEye(eye) {
        const container = isDualViewActive ? 
            (eye === 'L' ? leftImageContainer : rightImageContainer) : imageContainer;
        
        if (!container) return;
        
        container.innerHTML = '';
        const settings = imageSettings[eye];
        
        if (settings.canvas) {
            container.appendChild(settings.canvas);
            autoFitImage(settings);
            updateCanvasImage(eye);
        }
    }

    function autoFitImage(settings) {
        if (!settings.image) return;
    
        // Check if the image has already been fitted
        if (settings.isAutoFitted) return;
    
        const containerWidth = window.innerWidth;
        const containerHeight = window.innerHeight;
        const imageWidth = settings.image.naturalWidth;
        const imageHeight = settings.image.naturalHeight;
    
        const scaleX = containerWidth / imageWidth;
        const scaleY = containerHeight / imageHeight;
        const scale = Math.min(scaleX, scaleY) * 0.8;
    
        settings.scale = scale;
        settings.translateX = 0;
        settings.translateY = 0;
        settings.rotation = 0;
    
        updateCanvasTransform(currentEye);
    
        // Mark as fitted to prevent future resets
        settings.isAutoFitted = true;
    }

    function addToGallery(imageDataUrl, name) {
        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-item';
        galleryItem.innerHTML = `
            <div class="gallery-item-header">
                <span class="image-name">${name}</span>
                <div class="gallery-item-controls">
                    <button class="btn rename-btn">Rename</button>
                    <button class="btn load-btn">Load</button>
                </div>
            </div>
            <div class="gallery-item-content">
                <img src="${imageDataUrl}" alt="${name}" loading="lazy">
            </div>
        `;

        setupGalleryItemEvents(galleryItem, imageDataUrl);
        galleryAccordion.appendChild(galleryItem);
    }

    function setupGalleryItemEvents(galleryItem, imageDataUrl) {
        const imageNameElement = galleryItem.querySelector('.image-name');
        const renameBtn = galleryItem.querySelector('.rename-btn');
        const loadBtn = galleryItem.querySelector('.load-btn');
        
        renameBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const currentName = imageNameElement.textContent;
            const newName = prompt('Enter new name:', currentName);
            if (newName?.trim()) {
                imageNameElement.textContent = newName.trim();
            }
        });

        loadBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            loadImageFromGallery(imageDataUrl);
        });
    }

    function loadImageFromGallery(imageDataUrl) {
        const img = new Image();
        img.onload = function() {
            if (isDualViewActive) {
                // Assign to both eyes
                imageSettings['L'].image = img;
                imageSettings['R'].image = img;
                createCanvasForEye('L');
                createCanvasForEye('R');
                loadImageForSpecificEye('L');
                loadImageForSpecificEye('R');
            } else {
                imageSettings[currentEye].image = img;
                createCanvasForEye(currentEye);
                loadImageForSpecificEye(currentEye);
            }
            resetAdjustments();
        };
        img.src = imageDataUrl;
    }

    function resetAdjustments() {
        const defaultAdjustments = {
            exposure: 0,
            contrast: 0,
            saturation: 0,
            hue: 0,
            blur: 0,
            shadows: 0,
            highlights: 0,
            temperature: 0,
            sharpness: 0
        };

        if (isDualViewActive) {
            imageSettings['L'].adjustments = { ...defaultAdjustments };
            imageSettings['R'].adjustments = { ...defaultAdjustments };
        } else {
            imageSettings[currentEye].adjustments = { ...defaultAdjustments };
        }
        
        // Update all sliders and their displays
        Object.entries(adjustmentSliders).forEach(([adjustment, slider]) => {
            if (!slider) return;
            
            slider.value = defaultAdjustments[adjustment];
            const valueDisplay = slider.parentElement.querySelector('.adjustment-value');
            if (valueDisplay) {
                valueDisplay.textContent = defaultAdjustments[adjustment];
            }
        });

        // Update images with reset adjustments
        if (isDualViewActive) {
            requestAnimationFrame(() => {
                updateCanvasImage('L');
                updateCanvasImage('R');
            });
        } else {
            requestAnimationFrame(() => {
                updateCanvasImage(currentEye);
            });
        }
    }

    function switchEye(eye) {
        if (currentEye === eye) return;
        
        currentEye = eye;
        loadSVG(currentMap, eye); // Use currentMap instead of availableMaps[0]
        loadImageForSpecificEye(eye);
        updateSVGContainers(eye);
        
        if (opacitySlider) {
            opacitySlider.value = svgSettings[eye].opacity;
        }
        if (mapColor) {
            mapColor.value = svgSettings[eye].mapColor;
        }
        
        // Update all adjustment sliders to match current eye's settings
        Object.entries(adjustmentSliders).forEach(([adjustment, slider]) => {
            if (!slider) return;
            
            const value = imageSettings[eye].adjustments[adjustment];
            slider.value = value;
            const valueDisplay = slider.parentElement.querySelector('.adjustment-value');
            if (valueDisplay) {
                valueDisplay.textContent = value;
            }
        });
    }

    function toggleDualView() {
        isDualViewActive = !isDualViewActive;
        
        if (isDualViewActive) {
            singleMapperContainer.style.display = 'none';
            dualMapperContainer.style.display = 'flex';
            
            // Load images and SVGs for both eyes
            ['L', 'R'].forEach(eye => {
                if (imageSettings[eye].image) {
                    loadSVG(currentMap, eye);
                    updateSVGContainers(eye);
                    loadImageForSpecificEye(eye);
                }
            });
        } else {
            dualMapperContainer.style.display = 'none';
            singleMapperContainer.style.display = 'block';
            
            loadSVG(currentMap, currentEye);
            updateSVGContainers(currentEye);
            loadImageForSpecificEye(currentEye);
        }

        requestAnimationFrame(() => {
            if (isDualViewActive) {
                ['L', 'R'].forEach(eye => {
                    if (imageSettings[eye].canvas) updateCanvasImage(eye);
                });
            } else {
                if (imageSettings[currentEye].canvas) updateCanvasImage(currentEye);
            }
            updateHistogram();
        });
    }

    function updateSVGContainers(eye) {
        if (isDualViewActive) {
            if (eye === 'L') {
                if (leftSvgContainer) {
                    leftSvgContainer.style.opacity = svgSettings['L'].opacity;
                    changeMapColor(svgSettings['L'].mapColor, 'L');
                }
            } else if (eye === 'R') {
                if (rightSvgContainer) {
                    rightSvgContainer.style.opacity = svgSettings['R'].opacity;
                    changeMapColor(svgSettings['R'].mapColor, 'R');
                }
            }
        } else {
            if (svgContainer) {
                svgContainer.style.opacity = svgSettings[currentEye].opacity;
                changeMapColor(svgSettings[currentEye].mapColor, currentEye);
            }
        }
    }

    // Event Listeners for Eye Buttons
    document.getElementById('leftEye')?.addEventListener('click', () => {
        if (isDualViewActive) {
            isDualViewActive = false;
            currentEye = 'L';
            
            const btns = document.querySelectorAll('.eye-btn');
            btns.forEach(btn => btn.classList.remove('active'));
            document.getElementById('leftEye').classList.add('active');
            
            dualMapperContainer.style.display = 'none';
            singleMapperContainer.style.display = 'block';
            
            loadSVG(currentMap, 'L');
            updateSVGContainers('L');
            loadImageForSpecificEye('L');
        } else {
            switchEye('L');
            const btns = document.querySelectorAll('.eye-btn');
            btns.forEach(btn => btn.classList.remove('active'));
            document.getElementById('leftEye').classList.add('active');
        }
    });

    document.getElementById('rightEye')?.addEventListener('click', () => {
        if (isDualViewActive) {
            isDualViewActive = false;
            currentEye = 'R';
            
            const btns = document.querySelectorAll('.eye-btn');
            btns.forEach(btn => btn.classList.remove('active'));
            document.getElementById('rightEye').classList.add('active');
            
            dualMapperContainer.style.display = 'none';
            singleMapperContainer.style.display = 'block';
            
            loadSVG(currentMap, 'R');
            updateSVGContainers('R');
            loadImageForSpecificEye('R');
        } else {
            switchEye('R');
            const btns = document.querySelectorAll('.eye-btn');
            btns.forEach(btn => btn.classList.remove('active'));
            document.getElementById('rightEye').classList.add('active');
        }
    });

    document.getElementById('bothEyes')?.addEventListener('click', function() {
        toggleDualView();
        
        const btns = document.querySelectorAll('.eye-btn');
        btns.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
    });

    // Save functionality with optimized performance
    document.getElementById('save')?.addEventListener('click', () => {
        const containerToCapture = isDualViewActive ? dualMapperContainer : singleMapperContainer;
        if (!containerToCapture) return;

        progressIndicator.style.display = 'flex';

        // Use setTimeout to ensure the progress indicator is shown
        setTimeout(() => {
            html2canvas(containerToCapture, {
                useCORS: true,
                allowTaint: false,
                backgroundColor: null,
                scale: 2,
                width: containerToCapture.offsetWidth,
                height: containerToCapture.offsetHeight,
                windowWidth: containerToCapture.scrollWidth,
                windowHeight: containerToCapture.scrollHeight,
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = `iris_map_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                progressIndicator.style.display = 'none';
            }).catch(error => {
                console.error('Error saving image:', error);
                alert('Failed to save the image. Please try again.');
                progressIndicator.style.display = 'none';
            });
        }, 100);
    });

    // SVG and opacity controls
    opacitySlider?.addEventListener('input', function() {
        const newOpacity = parseFloat(this.value);
        if (isDualViewActive) {
            leftSvgContainer.style.opacity = newOpacity;
            rightSvgContainer.style.opacity = newOpacity;
            svgSettings['L'].opacity = newOpacity;
            svgSettings['R'].opacity = newOpacity;
        } else {
            svgContainer.style.opacity = newOpacity;
            svgSettings[currentEye].opacity = newOpacity;
        }
    });

    mapColor?.addEventListener('input', function() {
        const newColor = this.value;
        if (isDualViewActive) {
            changeMapColor(newColor, 'L');
            changeMapColor(newColor, 'R');
        } else {
            changeMapColor(newColor, currentEye);
        }
    });

    // Map selection modal
    document.getElementById('selectMap')?.addEventListener('click', () => {
        if (!mapModal || !mapOptions) return;
        
        mapModal.style.display = 'block';
        mapOptions.innerHTML = '';
        
        availableMaps.forEach(map => {
            const option = document.createElement('div');
            option.className = 'map-option';
            option.textContent = map;
            option.onclick = function() {
                currentMap = map; // Update currentMap
                if (isDualViewActive) {
                    loadSVG(currentMap, 'L');
                    loadSVG(currentMap, 'R');
                } else {
                    loadSVG(currentMap, currentEye);
                }
                mapModal.style.display = 'none';
            };
            mapOptions.appendChild(option);
        });
    });

    // Custom map upload
    document.getElementById('customMap')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.svg';
        input.onchange = e => {
            const file = e.target?.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = event => {
                if (!event.target?.result) return;
                const sanitizedSvg = DOMPurify.sanitize(event.target.result, { USE_PROFILES: { svg: true } });
                
                currentMap = 'custom'; // Set to custom map
                customSvgContent = sanitizedSvg; // Store custom SVG content
                
                if (isDualViewActive) {
                    if (leftSvgContainer) {
                        leftSvgContainer.innerHTML = customSvgContent;
                        setupSvgElement(leftSvgContainer, 'L');
                    }
                    if (rightSvgContainer) {
                        rightSvgContainer.innerHTML = customSvgContent;
                        setupSvgElement(rightSvgContainer, 'R');
                    }
                } else if (svgContainer) {
                    svgContainer.innerHTML = customSvgContent;
                    setupSvgElement(svgContainer, currentEye);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    // Modal controls
    closeBtn?.addEventListener('click', () => {
        if (mapModal) mapModal.style.display = 'none';
    });

    window.addEventListener('click', function(event) {
        if (event.target === mapModal) {
            mapModal.style.display = 'none';
        }
    });

    // Notes functionality
    document.getElementById('notes')?.addEventListener('click', () => {
        const notes = prompt('Enter notes:');
        if (notes) {
            console.log('Notes saved:', notes);
            alert('Notes saved successfully!');
        }
    });

    // SVG handling functions
    function loadSVG(svgFile, eye = currentEye) {
        const container = isDualViewActive ? 
            (eye === 'L' ? leftSvgContainer : rightSvgContainer) : svgContainer;
        
        if (!container) return;

        if (currentMap === 'custom') {
            // Inject custom SVG content directly
            container.innerHTML = customSvgContent;
            setupSvgElement(container, eye);
            svgSettings[eye].svgContent = customSvgContent;
        } else {
            fetch(`grids/${currentMap}_${eye}.svg`)
                .then(response => response.text())
                .then(svgContent => {
                    if (!container) return;
                    const sanitizedSVG = DOMPurify.sanitize(svgContent, { 
                        USE_PROFILES: { svg: true, svgFilters: true } 
                    });
                    container.innerHTML = sanitizedSVG;
                    svgSettings[eye].svgContent = sanitizedSVG;
                    setupSvgElement(container, eye);
                })
                .catch(error => {
                    console.error('Error loading SVG:', error);
                    if (container) container.innerHTML = '';
                    alert(`Failed to load SVG: ${currentMap}_${eye}.svg`);
                });
        }
    }

    function setupSvgElement(container, eye) {
        const svgElement = container?.querySelector('svg');
        if (!svgElement) return;

        svgElement.setAttribute('width', '100%');
        svgElement.setAttribute('height', '100%');
        svgElement.style.pointerEvents = 'none';
        svgElement.style.userSelect = 'none';
        
        if (container) {
            container.style.opacity = svgSettings[eye].opacity;
        }
        
        const svgTexts = svgElement.querySelectorAll('text');
        svgTexts.forEach(text => {
            text.style.userSelect = 'none';
        });
    }

    function changeMapColor(color, eye) {
        const container = isDualViewActive ? 
            (eye === 'L' ? leftSvgContainer : rightSvgContainer) : svgContainer;
        
        if (!container) return;

        const svgElements = container.querySelectorAll('svg path, svg line, svg circle');
        svgElements.forEach(element => {
            element.setAttribute('stroke', color);
        });
        
        svgSettings[eye].mapColor = color;
    }

    // Utility functions
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Drag prevention
    document.addEventListener('dragover', function(e) {
        e.preventDefault();
    });

    document.addEventListener('drop', function(e) {
        e.preventDefault();
    });

    // Initialize the application
    function initialize() {
        if (histogramCanvas) {
            histogramCanvas.width = histogramCanvas.offsetWidth || 300;
            histogramCanvas.height = histogramCanvas.offsetHeight || 150;
            histogramCanvas.width = histogramCanvas.offsetWidth;
            histogramCanvas.height = histogramCanvas.offsetHeight;
        }

        // Load default map for both eyes initially
        loadSVG(currentMap, 'L');
        loadSVG(currentMap, 'R');
        setupEnhancedAdjustmentControls();

        // Make control panels draggable
        controls.forEach(control => {
            makeElementDraggable(control);
        });

        // Set up resize handler
        const resizeHandler = debounce(() => {
            if (histogramCanvas) {
                histogramCanvas.width = histogramCanvas.offsetWidth;
                histogramCanvas.height = histogramCanvas.offsetHeight;
                updateHistogram();
            }
        }, 250);

        window.addEventListener('resize', resizeHandler);

        // Initialize any available controls
        if (opacitySlider) {
            opacitySlider.value = svgSettings[currentEye].opacity;
        }
        if (mapColor) {
            mapColor.value = svgSettings[currentEye].mapColor;
        }
    }

    // Start the application
    initialize();

    // Event Listeners for Image Upload and Add Image Button
    imageUpload.addEventListener('change', function(e) {
        const files = e.target.files;
        if (!files.length) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();
            
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    if (isDualViewActive) {
                        // Assign to both eyes
                        imageSettings['L'].image = img;
                        imageSettings['R'].image = img;
                        createCanvasForEye('L');
                        createCanvasForEye('R');
                        loadImageForSpecificEye('L');
                        loadImageForSpecificEye('R');
                    } else {
                        // Assign to current eye
                        imageSettings[currentEye].image = img;
                        createCanvasForEye(currentEye);
                        loadImageForSpecificEye(currentEye);
                    }
                    resetAdjustments();
                    addToGallery(event.target.result, file.name);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    document.querySelector('.add-image-btn')?.addEventListener('click', function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        
        input.onchange = function(e) {
            const files = e.target.files;
            if (!files.length) return;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const reader = new FileReader();
                reader.onload = function(event) {
                    addToGallery(event.target.result, file.name);
                };
                reader.readAsDataURL(file);
            }
        };
        
        input.click();
    });

    // Set up adjustment slider events with optimized performance
    Object.entries(adjustmentSliders).forEach(([adjustment, slider]) => {
        if (!slider) return;

        const updateSlider = debounce(function(value) {
            if (isDualViewActive) {
                ['L', 'R'].forEach(eye => {
                    imageSettings[eye].adjustments[adjustment] = parseFloat(value);
                    requestAnimationFrame(() => {
                        updateCanvasImage(eye);
                    });
                });
            } else {
                if (!imageSettings[currentEye]) return;
                imageSettings[currentEye].adjustments[adjustment] = parseFloat(value);
                requestAnimationFrame(() => {
                    updateCanvasImage(currentEye);
                });
            }
        }, 16); // Debounce at 60fps rate

        slider.addEventListener('input', function() {
            const value = parseFloat(this.value);
            this.nextElementSibling.textContent = value;
            updateSlider(value);
        });
    });

    document.getElementById('resetAdjustments')?.addEventListener('click', resetAdjustments);

    document.getElementById('autoLevels')?.addEventListener('click', function() {
        const settings = isDualViewActive ? imageSettings['L'] : imageSettings[currentEye];
        if (!settings.image) return;

        // Create temporary canvas for analysis
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        tempCanvas.width = 256;
        const aspectRatio = settings.image.naturalHeight / settings.image.naturalWidth;
        tempCanvas.height = Math.round(256 * aspectRatio);

        tempCtx.drawImage(settings.image, 0, 0, tempCanvas.width, tempCanvas.height);
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;

        let minLuminance = 255;
        let maxLuminance = 0;
        
        // Sample pixels for performance
        for (let i = 0; i < data.length; i += 16) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            minLuminance = Math.min(minLuminance, luminance);
            maxLuminance = Math.max(maxLuminance, luminance);
        }

        // Calculate adjustments
        const exposureAdjustment = ((maxLuminance + minLuminance) / 2 - 127.5) / 127.5 * -100;
        const contrastAdjustment = ((255 / (maxLuminance - minLuminance)) - 1) * 100;

        // Apply calculated adjustments
        const exposure = Math.max(-100, Math.min(100, exposureAdjustment));
        const contrast = Math.max(-100, Math.min(100, contrastAdjustment));

        if (isDualViewActive) {
            ['L', 'R'].forEach(eye => {
                imageSettings[eye].adjustments.exposure = exposure;
                imageSettings[eye].adjustments.contrast = contrast;
            });
        } else {
            imageSettings[currentEye].adjustments.exposure = exposure;
            imageSettings[currentEye].adjustments.contrast = contrast;
        }

        // Update UI
        Object.entries(adjustmentSliders).forEach(([adjustment, slider]) => {
            if (adjustment === 'exposure' && adjustmentSliders.exposure) {
                adjustmentSliders.exposure.value = exposure;
                adjustmentSliders.exposure.nextElementSibling.textContent = Math.round(exposure);
            }
            if (adjustment === 'contrast' && adjustmentSliders.contrast) {
                adjustmentSliders.contrast.value = contrast;
                adjustmentSliders.contrast.nextElementSibling.textContent = Math.round(contrast);
            }
        });

        // Update images
        if (isDualViewActive) {
            ['L', 'R'].forEach(eye => {
                updateCanvasImage(eye);
            });
        } else {
            updateCanvasImage(currentEye);
        }
    });

    // Image transformation controls
    document.getElementById('rotateLeft')?.addEventListener('click', () => {
        if (isDualViewActive) {
            ['L', 'R'].forEach(eye => {
                imageSettings[eye].rotation -= 5;
                updateCanvasTransform(eye);
            });
        } else {
            imageSettings[currentEye].rotation -= 5;
            updateCanvasTransform(currentEye);
        }
    });

    document.getElementById('rotateRight')?.addEventListener('click', () => {
        if (isDualViewActive) {
            ['L', 'R'].forEach(eye => {
                imageSettings[eye].rotation += 5;
                updateCanvasTransform(eye);
            });
        } else {
            imageSettings[currentEye].rotation += 5;
            updateCanvasTransform(currentEye);
        }
    });

    document.getElementById('zoomIn')?.addEventListener('click', () => {
        if (isDualViewActive) {
            ['L', 'R'].forEach(eye => {
                let newScale = (imageSettings[eye].scale || 1) * 1.1;
                newScale = Math.min(newScale, 10);
                imageSettings[eye].scale = newScale;
                updateCanvasTransform(eye);
            });
        } else {
            let newScale = (imageSettings[currentEye].scale || 1) * 1.1;
            newScale = Math.min(newScale, 10);
            imageSettings[currentEye].scale = newScale;
            updateCanvasTransform(currentEye);
        }
    });

    document.getElementById('zoomOut')?.addEventListener('click', () => {
        if (isDualViewActive) {
            ['L', 'R'].forEach(eye => {
                let newScale = (imageSettings[eye].scale || 1) / 1.1;
                newScale = Math.max(newScale, 0.1);
                imageSettings[eye].scale = newScale;
                updateCanvasTransform(eye);
            });
        } else {
            let newScale = (imageSettings[currentEye].scale || 1) / 1.1;
            newScale = Math.max(newScale, 0.1);
            imageSettings[currentEye].scale = newScale;
            updateCanvasTransform(currentEye);
        }
    });

    // Movement controls with optimized transforms
    const moveImage = (direction) => {
        const amount = 10;
        if (isDualViewActive) {
            ['L', 'R'].forEach(eye => {
                const settings = imageSettings[eye];
                switch(direction) {
                    case 'up':
                        settings.translateY -= amount;
                        break;
                    case 'down':
                        settings.translateY += amount;
                        break;
                    case 'left':
                        settings.translateX -= amount;
                        break;
                    case 'right':
                        settings.translateX += amount;
                        break;
                }
                updateCanvasTransform(eye);
            });
        } else {
            const settings = imageSettings[currentEye];
            switch(direction) {
                case 'up':
                    settings.translateY -= amount;
                    break;
                case 'down':
                    settings.translateY += amount;
                    break;
                case 'left':
                    settings.translateX -= amount;
                    break;
                case 'right':
                    settings.translateX += amount;
                    break;
            }
            updateCanvasTransform(currentEye);
        }
    };

    document.getElementById('moveUp')?.addEventListener('click', () => moveImage('up'));
    document.getElementById('moveDown')?.addEventListener('click', () => moveImage('down'));
    document.getElementById('moveLeft')?.addEventListener('click', () => moveImage('left'));
    document.getElementById('moveRight')?.addEventListener('click', () => moveImage('right'));

    // Save functionality with optimized performance
    document.getElementById('save')?.addEventListener('click', () => {
        const containerToCapture = isDualViewActive ? dualMapperContainer : singleMapperContainer;
        if (!containerToCapture) return;

        progressIndicator.style.display = 'flex';

        // Use setTimeout to ensure the progress indicator is shown
        setTimeout(() => {
            html2canvas(containerToCapture, {
                useCORS: true,
                allowTaint: false,
                backgroundColor: null,
                scale: 2,
                width: containerToCapture.offsetWidth,
                height: containerToCapture.offsetHeight,
                windowWidth: containerToCapture.scrollWidth,
                windowHeight: containerToCapture.scrollHeight,
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = `iris_map_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                progressIndicator.style.display = 'none';
            }).catch(error => {
                console.error('Error saving image:', error);
                alert('Failed to save the image. Please try again.');
                progressIndicator.style.display = 'none';
            });
        }, 100);
    });

    // SVG and opacity controls
    opacitySlider?.addEventListener('input', function() {
        const newOpacity = parseFloat(this.value);
        if (isDualViewActive) {
            leftSvgContainer.style.opacity = newOpacity;
            rightSvgContainer.style.opacity = newOpacity;
            svgSettings['L'].opacity = newOpacity;
            svgSettings['R'].opacity = newOpacity;
        } else {
            svgContainer.style.opacity = newOpacity;
            svgSettings[currentEye].opacity = newOpacity;
        }
    });

    mapColor?.addEventListener('input', function() {
        const newColor = this.value;
        if (isDualViewActive) {
            changeMapColor(newColor, 'L');
            changeMapColor(newColor, 'R');
        } else {
            changeMapColor(newColor, currentEye);
        }
    });

    // Map selection modal
    document.getElementById('selectMap')?.addEventListener('click', () => {
        if (!mapModal || !mapOptions) return;
        
        mapModal.style.display = 'block';
        mapOptions.innerHTML = '';
        
        availableMaps.forEach(map => {
            const option = document.createElement('div');
            option.className = 'map-option';
            option.textContent = map;
            option.onclick = function() {
                currentMap = map; // Update currentMap
                if (isDualViewActive) {
                    loadSVG(currentMap, 'L');
                    loadSVG(currentMap, 'R');
                } else {
                    loadSVG(currentMap, currentEye);
                }
                mapModal.style.display = 'none';
            };
            mapOptions.appendChild(option);
        });
    });

    // Custom map upload
    document.getElementById('customMap')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.svg';
        input.onchange = e => {
            const file = e.target?.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = event => {
                if (!event.target?.result) return;
                const sanitizedSvg = DOMPurify.sanitize(event.target.result, { USE_PROFILES: { svg: true } });
                
                currentMap = 'custom'; // Set to custom map
                customSvgContent = sanitizedSvg; // Store custom SVG content
                
                if (isDualViewActive) {
                    if (leftSvgContainer) {
                        leftSvgContainer.innerHTML = customSvgContent;
                        setupSvgElement(leftSvgContainer, 'L');
                    }
                    if (rightSvgContainer) {
                        rightSvgContainer.innerHTML = customSvgContent;
                        setupSvgElement(rightSvgContainer, 'R');
                    }
                } else if (svgContainer) {
                    svgContainer.innerHTML = customSvgContent;
                    setupSvgElement(svgContainer, currentEye);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    // Modal controls
    closeBtn?.addEventListener('click', () => {
        if (mapModal) mapModal.style.display = 'none';
    });

    window.addEventListener('click', function(event) {
        if (event.target === mapModal) {
            mapModal.style.display = 'none';
        }
    });

    // Notes functionality
    document.getElementById('notes')?.addEventListener('click', () => {
        const notes = prompt('Enter notes:');
        if (notes) {
            console.log('Notes saved:', notes);
            alert('Notes saved successfully!');
        }
    });

    // SVG handling functions
    function loadSVG(svgFile, eye = currentEye) {
        const container = isDualViewActive ? 
            (eye === 'L' ? leftSvgContainer : rightSvgContainer) : svgContainer;
        
        if (!container) return;

        if (currentMap === 'custom') {
            // Inject custom SVG content directly
            container.innerHTML = customSvgContent;
            setupSvgElement(container, eye);
            svgSettings[eye].svgContent = customSvgContent;
        } else {
            fetch(`grids/${currentMap}_${eye}.svg`)
                .then(response => response.text())
                .then(svgContent => {
                    if (!container) return;
                    const sanitizedSVG = DOMPurify.sanitize(svgContent, { 
                        USE_PROFILES: { svg: true, svgFilters: true } 
                    });
                    container.innerHTML = sanitizedSVG;
                    svgSettings[eye].svgContent = sanitizedSVG;
                    setupSvgElement(container, eye);
                })
                .catch(error => {
                    console.error('Error loading SVG:', error);
                    if (container) container.innerHTML = '';
                    alert(`Failed to load SVG: ${currentMap}_${eye}.svg`);
                });
        }
    }

    function setupSvgElement(container, eye) {
        const svgElement = container?.querySelector('svg');
        if (!svgElement) return;

        svgElement.setAttribute('width', '100%');
        svgElement.setAttribute('height', '100%');
        svgElement.style.pointerEvents = 'none';
        svgElement.style.userSelect = 'none';
        
        if (container) {
            container.style.opacity = svgSettings[eye].opacity;
        }
        
        const svgTexts = svgElement.querySelectorAll('text');
        svgTexts.forEach(text => {
            text.style.userSelect = 'none';
        });
    }

    function changeMapColor(color, eye) {
        const container = isDualViewActive ? 
            (eye === 'L' ? leftSvgContainer : rightSvgContainer) : svgContainer;
        
        if (!container) return;

        const svgElements = container.querySelectorAll('svg path, svg line, svg circle');
        svgElements.forEach(element => {
            element.setAttribute('stroke', color);
        });
        
        svgSettings[eye].mapColor = color;
    }

    // Initialize the application
    function initialize() {
        if (histogramCanvas) {
            histogramCanvas.width = histogramCanvas.offsetWidth || 300;
            histogramCanvas.height = histogramCanvas.offsetHeight || 150;
            histogramCanvas.width = histogramCanvas.offsetWidth;
            histogramCanvas.height = histogramCanvas.offsetHeight;
        }

        // Load default map for both eyes initially
        loadSVG(currentMap, 'L');
        loadSVG(currentMap, 'R');
        setupEnhancedAdjustmentControls();

        // Make control panels draggable
        controls.forEach(control => {
            makeElementDraggable(control);
        });

        // Set up resize handler
        const resizeHandler = debounce(() => {
            if (histogramCanvas) {
                histogramCanvas.width = histogramCanvas.offsetWidth;
                histogramCanvas.height = histogramCanvas.offsetHeight;
                updateHistogram();
            }
        }, 250);

        window.addEventListener('resize', resizeHandler);

        // Initialize any available controls
        if (opacitySlider) {
            opacitySlider.value = svgSettings[currentEye].opacity;
        }
        if (mapColor) {
            mapColor.value = svgSettings[currentEye].mapColor;
        }
    }

    // Start the application
    initialize();
});
