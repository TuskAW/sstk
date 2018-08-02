The SceneToolkit provides several classes for viewing models.

{@linkcode SimpleModelViewer}  - A basic viewer for viewing a single 3D model

Example of using `STK.SimpleModelViewer` with `STK.bundle.js`
```html
<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/html">
<head>
  <link rel="stylesheet" type="text/css" href="css/common.css">
  <link rel="stylesheet" type="text/css" href="css/model-viewer.css">
  <title>Model Viewer</title>
  <meta charset="utf-8">
</head>

<body>
  <div id="canvas"></div>
  <script src="https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js"></script>
  <script src="https://ajax.googleapis.com/ajax/libs/jqueryui/1.11.4/jquery-ui.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.12/d3.min.js"></script>
  <script src="three.min.js"></script>
  <script src="STK.bundle.js"></script>
  <script>
    var modelViewer = new STK.SimpleModelViewer({
      container: document.getElementById('canvas')
    });
    modelViewer.singleModelCanvas.showLoadingIcon(true);
    modelViewer.redisplay();
  </script>
</body>
</html>
```

{@linkcode SimpleModelViewerWithControls} - A more complex viewer that shows the parts, images, 
and annotations associated with a model.

{@linkcode ModelViewer} - The full model viewer with complex controls.


