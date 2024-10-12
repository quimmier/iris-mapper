document.addEventListener('DOMContentLoaded', function() {
    const svgObject = document.getElementById('irisMap');
    
    svgObject.addEventListener('load', function() {
        const svgDoc = svgObject.contentDocument;
        const svgElement = svgDoc.documentElement;
        
        // Make the SVG change color when you click on it
        svgElement.addEventListener('click', function(e) {
            if (e.target.tagName === 'path') {
                e.target.style.fill = getRandomColor();
            }
        });

        // Change transparency with the slider
        const opacitySlider = document.getElementById('opacitySlider');
        opacitySlider.addEventListener('input', function() {
            svgElement.style.opacity = this.value;
        });

        // Draw on the SVG
        const drawButton = document.getElementById('drawButton');
        let isDrawing = false;
        let currentPath;

        drawButton.addEventListener('click', function() {
            isDrawing = !isDrawing;
            this.textContent = isDrawing ? 'Stop Drawing' : 'Start Drawing';
        });

        svgElement.addEventListener('mousedown', startDrawing);
        svgElement.addEventListener('mousemove', draw);
        svgElement.addEventListener('mouseup', endDrawing);

        function startDrawing(e) {
            if (!isDrawing) return;
            const pt = svgElement.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgP = pt.matrixTransform(svgElement.getScreenCTM().inverse());
            currentPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            currentPath.setAttribute("d", `M${svgP.x},${svgP.y}`);
            currentPath.setAttribute("fill", "none");
            currentPath.setAttribute("stroke", "red");
            currentPath.setAttribute("stroke-width", "2");
            svgElement.appendChild(currentPath);
        }

        function draw(e) {
            if (!isDrawing || !currentPath) return;
            const pt = svgElement.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgP = pt.matrixTransform(svgElement.getScreenCTM().inverse());
            const d = currentPath.getAttribute("d");
            currentPath.setAttribute("d", `${d} L${svgP.x},${svgP.y}`);
        }

        function endDrawing() {
            currentPath = null;
        }

        // Save the SVG
        const saveButton = document.getElementById('saveButton');
        saveButton.addEventListener('click', function() {
            const svgData = new XMLSerializer().serializeToString(svgElement);
            const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
            const svgUrl = URL.createObjectURL(svgBlob);
            const downloadLink = document.createElement('a');
            downloadLink.href = svgUrl;
            downloadLink.download = 'my_awesome_iris_map.svg';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        });
    });
});

// Helper function to get a random color
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}