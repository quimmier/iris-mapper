// Set up the canvas using Fabric.js
const canvas = new fabric.Canvas('canvas');
let gridOverlay;  // To hold the SVG iris map

// Handle image upload
document.getElementById('imageLoader').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const imgObj = new Image();
        imgObj.src = event.target.result;
        imgObj.onload = function() {
            const image = new fabric.Image(imgObj);
            image.set({
                left: 0,
                top: 0,
                selectable: false,  // Disable movement of background image
                scaleX: canvas.width / image.width,
                scaleY: canvas.height / image.height,
            });
            canvas.setBackgroundImage(image, canvas.renderAll.bind(canvas));
        };
    };
    reader.readAsDataURL(e.target.files[0]);
});

// Handle SVG iris map selection
document.getElementById('gridSelector').addEventListener('change', function(e) {
    const gridFile = e.target.value;

    // Remove any existing grid overlay
    if (gridOverlay) {
        canvas.remove(gridOverlay);
    }

    // Load the selected SVG iris map
    fabric.loadSVGFromURL(gridFile, function(objects, options) {
        gridOverlay = fabric.util.groupSVGElements(objects, options);
        gridOverlay.set({
            left: 0,
            top: 0,
            opacity: 0.5,  // Set initial transparency
            selectable: true,  // Allow user to manipulate the overlay
        });
        gridOverlay.scaleToWidth(canvas.width);  // Fit the SVG to the canvas
        canvas.add(gridOverlay);
        canvas.renderAll();  // Redraw the canvas
    });
});

// Handle opacity adjustment
document.getElementById('opacitySlider').addEventListener('input', function() {
    if (gridOverlay) {
        gridOverlay.set('opacity', this.value);
        canvas.renderAll();
    }
});

// Rotate the SVG left
document.getElementById('rotateLeft').addEventListener('click', function() {
    if (gridOverlay) {
        gridOverlay.rotate(gridOverlay.angle - 15);
        canvas.renderAll();
    }
});

// Rotate the SVG right
document.getElementById('rotateRight').addEventListener('click', function() {
    if (gridOverlay) {
        gridOverlay.rotate(gridOverlay.angle + 15);
        canvas.renderAll();
    }
});

// Zoom in
document.getElementById('zoomIn').addEventListener('click', function() {
    canvas.setZoom(canvas.getZoom() * 1.1);
    canvas.renderAll();
});

// Zoom out
document.getElementById('zoomOut').addEventListener('click', function() {
    canvas.setZoom(canvas.getZoom() * 0.9);
    canvas.renderAll();
});

// Save the final image with the overlay
document.getElementById('saveButton').addEventListener('click', function() {
    const dataURL = canvas.toDataURL({
        format: 'png',
        quality: 1.0
    });
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'iris-mapper.png';
    link.click();
});
