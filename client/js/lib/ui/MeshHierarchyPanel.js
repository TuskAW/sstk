var Constants = require('Constants');
var Materials = require('materials/Materials');
var Object3DUtil = require('geo/Object3DUtil');
var GeometryUtil = require('geo/GeometryUtil');
var PubSub = require('PubSub');
var _ = require('util/util');

function MeshHierarchyPanel(params) {
  PubSub.call(this);
  this.filterEmptyGeometries = params.filterEmptyGeometries;
  this.showMultiMaterial = params.showMultiMaterial;
  this.collapseNestedPaths = params.collapseNestedPaths;
  this.highlightByHidingOthers = params.highlightByHidingOthers;
  this.__useSpecialMaterial = params.useSpecialMaterial;
  this.specialMaterial = params.specialMaterial || Object3DUtil.ClearMat;
  this.highlightMaterial = params.highlightMaterial || Object3DUtil.getSimpleFalseColorMaterial(1);
  this.treePanel = params.treePanel;
  this.app = params.app;
  this.onhoverCallback = params.onhoverCallback;

  // The model instance that we are segmenting
  this.modelInstance = null;
  // The original object that we are segmenting
  this.origObject3D = null;
  //Starting node of the parts hierarchy for the model
  this.partsNode = null;

  if (params.getMeshId) {
    this.getMeshId = params.getMeshId;
  }
}

MeshHierarchyPanel.prototype = Object.create(PubSub.prototype);
MeshHierarchyPanel.prototype.constructor = MeshHierarchyPanel;

Object.defineProperty(MeshHierarchyPanel.prototype, 'maxHierarchyLevel', {
  get: function () {
    return this.partsNode.userData.level;
  }
});

Object.defineProperty(MeshHierarchyPanel.prototype, 'useSpecialMaterial', {
  get: function () {
    return this.__useSpecialMaterial;
  },
  set: function (flag) {
    this.__useSpecialMaterial = flag;
    this.refreshHighlighting();
  }
});

//Gets all the mesh nodes in the model
MeshHierarchyPanel.prototype.getNodes = function () {
  return this.partNodes;
};

// MeshHierarchyPanel.prototype.getMeshes = function () {
//   return _.filter(this.partNodes, function(x) { return (x instance THREE.Mesh; }));
// };

//Gets the mesh Id
MeshHierarchyPanel.prototype.getMeshId = function (mesh) {
  return Constants.meshPrefix + Object3DUtil.getSceneGraphPath(mesh, this.partsNode);
};

MeshHierarchyPanel.prototype.findNodes = function (meshIds) {
  var nonSGIds = [];
  var matchedNodes = [];
  for (var i = 0; i < meshIds.length; i++) {
    var meshId = meshIds[i];

    if (meshId.startsWith('SGPath-')) {
      var mesh = Object3DUtil.getNodeFromSceneGraphPath(this.partsNode, meshId.substr(7));
      if (mesh) {
        matchedNodes.push(mesh);
      }
    } else {
      nonSGIds.push(meshId);
    }
  }
  if (nonSGIds.length > 0) {
    matchedNodes = this.findNodesSlow(nonSGIds, matchedNodes);
  }
  return matchedNodes;
};

MeshHierarchyPanel.prototype.findNodesSlow = function (ids, matched) {
  // Does brute force find (slow!)
  var allNodes = this.getNodes();
  var matchedNodes = matched || [];
  for (var j = 0; j < ids.length; j++) {
    var id = ids[j];
    for (var i = 0; i < allNodes.length; i++) {
      var thisId = this.getMeshId(allNodes[i]);
      if (thisId === id) {
        matchedNodes.push(allNodes[i]);
      }
    }
  }
  return matchedNodes;
};

MeshHierarchyPanel.prototype.setPartsNode = function(partsNode) {
  this.partsNode = partsNode;
  //Object3DUtil.applyMaterial(this.partsNode, Object3DUtil.ClearMat, true, true);
  if (this.treePanel && this.treePanel.length > 0) {
    this.__setPartHierarchy(this.partsNode);
  } else {
    this.__computePartNodes(this.partsNode);
  }
};

MeshHierarchyPanel.prototype.setTarget = function(target) {
  var stripLayersCount = 0;
  if (target instanceof THREE.Object3D) {
    this.origObject3D = target;
    this.modelInstance = null;
  } else {
    // Assume is ModelInstance...
    this.origObject3D = target.object3D;
    this.modelInstance = target;
    // Strip out up to two layers (modelInstance and model wrapping)
    stripLayersCount = 2;
  }
  this.__computePartHierarchyFromObject3D(this.origObject3D, stripLayersCount);
};

MeshHierarchyPanel.prototype.setSegmented = function(segmented) {
  this.__computePartHierarchyFromObject3D(segmented || this.origObject3D);
};

MeshHierarchyPanel.prototype.__computePartHierarchyFromObject3D = function(object3D, stripLayersCount) {
  console.log('setParts', object3D);
  this.partsNode = object3D.clone();
  this.partsNode.name = this.partsNode.name + '-parts';
  for (var i = 0; i < stripLayersCount; i++) {
    if (this.partsNode.children.length === 1) {
      var wm = this.partsNode.matrix;
      this.partsNode = this.partsNode.children[0];
      this.partsNode.applyMatrix(wm);
    } else {
      break;
    }
  }
  Object3DUtil.saveMaterials(this.partsNode);
  if (this.useSpecialMaterial) {
    Object3DUtil.applyMaterial(this.partsNode, this.specialMaterial, true, true);
  }
  if (this.treePanel && this.treePanel.length > 0) {
    this.__setPartHierarchy(this.partsNode);
  } else {
    this.__computePartNodes(this.partsNode);
  }
  Object3DUtil.setVisible(this.partsNode, false);
};

MeshHierarchyPanel.prototype.__collapsePartHierarchy = function (uncollapsedTreeNodes) {
  // Index by id
  var nodesById = {};
  for (var i = 0; i < uncollapsedTreeNodes.length; i++) {
    var node = uncollapsedTreeNodes[i];
    nodesById[node.id] = {
      id: node.id,
      node: node,
      children: []
    };
  }
  // add child indices
  var roots = [];
  for (var i = 0; i < uncollapsedTreeNodes.length; i++) {
    var node = uncollapsedTreeNodes[i];
    var wrappedNode = nodesById[node.id];
    if (node.parent !== '#') {
      var parentWrappedNode = nodesById[node.parent];
      wrappedNode.parent = parentWrappedNode;
      parentWrappedNode.children.push(wrappedNode);
    } else {
      roots.push(wrappedNode);
    }
  }
  // Collapse chains
  function collapse(wnode) {
    if (wnode.children.length === 1) {
      var collapsed = collapse(wnode.children[0]);
      if (collapsed.node instanceof Array) {
        collapsed.node.splice(0, 0, wnode.node);
      } else {
        collapsed.node = [wnode.node, collapsed.node];
      }
      collapsed.parent = wnode.parent;
      return collapsed;
    } else {
      for (var j = 0; j < wnode.children.length; j++) {
        wnode.children[j] = collapse(wnode.children[j]);
      }
      return wnode;
    }
  }

  function addCollapsedNodes(treenodes, wnode) {
    if (wnode.node instanceof Array) {
      var index = treenodes.length;
      var label = wnode.node.map(function (x) { return x.text; }).join('/');
      treenodes[index] = {
        id: wnode.id,
        parent: wnode.node[0].parent,
        //            text: wnode.node[0].text,
        text: label,
        metadata: wnode.node[0].metadata,
        li_attr: wnode.node[0].li_attr
      };
    } else {
      treenodes.push(wnode.node);
    }
    for (var j = 0; j < wnode.children.length; j++) {
      addCollapsedNodes(treenodes, wnode.children[j]);
    }
  }

  var collapsedTreeNodes = [];
  for (var i = 0; i < roots.length; i++) {
    var collapsed = collapse(roots[i]);
    addCollapsedNodes(collapsedTreeNodes, collapsed);
  }
  return collapsedTreeNodes;
};

MeshHierarchyPanel.prototype.__computeNodeStatistics = function(root) {
  var showMultiMaterial = this.showMultiMaterial;
  // Compute number of faces at each node
  Object3DUtil.traverse(root, function (node) {
    return true;
  }, function (node) {
    var nfaces = 0;
    var nleafs = 0;
    if (node instanceof THREE.Mesh) {
      nfaces = GeometryUtil.getGeometryFaceCount(node.geometry);
      nleafs = 1;
      if (showMultiMaterial) {
        var nmats = (node.material instanceof THREE.MultiMaterial) ? node.material.materials.length :
          (Array.isArray(node.material)? node.material.length : 1);
        nleafs = nmats;
      }
    } else if (node.children && node.children.length > 0) {
      for (var i = 0; i < node.children.length; i++) {
        if (node.children[i].userData.nfaces) {
          nfaces += node.children[i].userData.nfaces;
          nleafs += node.children[i].userData.nleafs;
        }
      }
    }
    node.userData.nfaces = nfaces;
    node.userData.nleafs = nleafs;
  });
};

MeshHierarchyPanel.prototype.__setPartHierarchy = function (root) {
  // Convert node to jstree data
  var partNodes = [];
  var treeNodes = [];
  var rootIndices = [];

  var filterEmptyGeometries = this.filterEmptyGeometries;
  var showMultiMaterial = this.showMultiMaterial;
  var collapseNestedPaths = this.collapseNestedPaths;

  this.__computeNodeStatistics(root);
  Object3DUtil.traverse(root, function (node) {
    var nfaces = node.userData.nfaces;

    if (filterEmptyGeometries) {
      if (!nfaces) return false;
    }

    var index = treeNodes.length;
    var parentId = (node !== root && node.parent) ? 'ph-' + node.parent.uuid : '#';
    treeNodes[index] = {
      id: 'ph-' + node.uuid,
      parent: parentId,
      text: node.name || (node.userData && node.userData.id) || node.id,
      metadata: { index: index }
    };
    partNodes[index] = node;

    if (parentId === '#') {
      rootIndices.push(index);
    }
    var titleJson = _.defaults({nfaces: nfaces}, _.omit(node.userData, ['origMaterial']));
    if (node instanceof THREE.Mesh) {
      //var nfaces = GeometryUtil.getGeometryFaceCount(node.geometry);
      var nmats = (node.material instanceof THREE.MultiMaterial) ? node.material.materials.length :
        (Array.isArray(node.material)? node.material.length : 1);
      titleJson['nmats'] = nmats;
      treeNodes[index]['li_attr'] = {};
      treeNodes[index]['li_attr']['title'] = JSON.stringify(titleJson, null, 2);
      if (showMultiMaterial && nmats > 1) {
        var origMat = node.cachedData? node.cachedData.origMaterial : null;
        var origMaterials = Materials.toMaterialArray(origMat);
        for (var i = 0; i < nmats; i++) {
          var mi = treeNodes.length;
          var pId = 'ph-' + node.uuid;
          treeNodes[mi] = {
            id: 'ph-' + node.uuid + '-' + i,
            parent: pId,
            text: origMaterials.length? origMaterials[i].name : 'material' + i,
            metadata: { index: mi }
          };
          partNodes[mi] = { node: node, materialIndex: i };
        }
      }
    } else if (node instanceof THREE.Object3D) {
      //var nchildren = node.children.length;
      treeNodes[index]['li_attr'] = {};
      treeNodes[index]['li_attr']['title'] = JSON.stringify(titleJson, null, 2);
    }
    return true;
  });

  if (collapseNestedPaths) {
    treeNodes = this.__collapsePartHierarchy(treeNodes, rootIndices);
  }

  //console.log(treeNodes);

  var searchOptions = { 'case_insensitive': true };
  var scope = this;
  this.treePanel.empty();
  this.tree = $('<div class="tree"></div>');
  this.treePanel.append(this.tree);
  this.tree.jstree({
    'core': {
      'data': treeNodes,
      'themes': { 'name': 'default', 'responsive': true, 'stripes': true, 'icons': false }
    },
    'search': searchOptions,
    'plugins': ['search', 'contextmenu'],
    'contextmenu':{
      "items": function(node) {
        console.log(node);
        //var partNode = scope.partNodes[node.original.metadata['index']];
        //var clickedFrom = [partNode];
        var targets = scope.getSelectedPartNodes();
        var items = {};
        if (targets && targets.length) {
          items['lookAtItem'] = {
            "label": "Look at",
            "action": function (item) {
              // TODO: Handle look at item for multiple selected
              if (targets && targets.length) {
                scope.app.lookAt(scope.partsNode, targets);
              }
            },
            "_class": "class"
          };

          function addSetVisibleOption(items, name, label, flag, recursive) {
            items[name] = {
              "label" : label,
              "action" : function(item) {
                _.each(targets, function(x) {
                  Object3DUtil.setVisible(x, flag, recursive);
                });
              },
              "_class" : "class"
            };

          }

          var isAllVisible = _.every(targets, function(x) { return x.visible; });
          var isAllHidden = _.every(targets, function(x) { return !x.visible; });

          if (isAllVisible) {
            addSetVisibleOption(items, "setTreeVisibleFalse", "Hide tree", false, true);
            addSetVisibleOption(items, "setNodeVisibleFalse", "Hide node", false, false);
          } else if (isAllHidden) {
            addSetVisibleOption(items, "setTreeVisibleTrue", "Show tree", true, true);
            addSetVisibleOption(items, "setNodeVisibleTrue", "Show node", true, false);
          } else {
            addSetVisibleOption(items, "setTreeVisibleFalse", "Hide tree", false, true);
            addSetVisibleOption(items, "setTreeVisibleTrue", "Show tree", true, true);
            addSetVisibleOption(items, "setNodeVisibleFalse", "Hide node", false, false);
            addSetVisibleOption(items, "setNodeVisibleTrue", "Show node", true, false);
          }

          items['unselectAll'] = {
            "label": "Unselect all",
            "action": function(item) {
              scope.tree.jstree('deselect_all', false);
              scope.clearHighlighting();
            }
          };

          if (scope.app && scope.app.open) {
            items['openItem'] = {
              "label": "Open",
              "action": function(item) {
                if (targets && targets.length) {
                  scope.app.open(scope.partsNode, targets);
                }
              }
            };
          }
        }
        return items;
      }
    }
  });

  this.partNodes = partNodes;
  this.tree.bind('select_node.jstree',
    function (event, data) {
      //TODO: do something with meshnode
      var node = data.node.original;
      var partNode = this.partNodes[node.metadata['index']];
      if (partNode) {
        var sgpath;
        if (partNode instanceof THREE.Object3D) {
          sgpath = Object3DUtil.getSceneGraphPath(partNode, this.partsNode);
        } else {
          sgpath = Object3DUtil.getSceneGraphPath(partNode['node'], this.partsNode) + '[' + partNode['materialIndex'] + ']';
        }
        console.log('SGPATH-' + sgpath);
        this.currentSelectedPart = partNode;
      }
      this.refreshHighlighting();
      Object3DUtil.setVisible(this.origObject3D, false);
      this.Publish('SelectNode', partNode);
    }.bind(this)
  );
  this.tree.bind('changed.jstree',
    function (event, data) {
      scope.refreshHighlighting();
    }.bind(this)
  );


  if (this.onhoverCallback) {
    this.tree.bind('hover_node.jstree',
      function (event, data) {
        var node = data.node.original;
        var meshNode = node.metadata['node'];
        // TODO: do something with meshNode
        this.onhoverCallback(meshNode);
      }.bind(this)
    );
    this.tree.bind('mouseout.jstree',
      function (event, data) {
        this.onhoverCallback(null);
      }.bind(this)
    );
  }
};

MeshHierarchyPanel.prototype.getSelectedPartNodes = function() {
  var selected = this.tree.jstree('get_selected', true);
  return this.__getPartNodes(selected);
};

MeshHierarchyPanel.prototype.__getPartNodes = function(nodes, objects) {
  objects = objects || [];
  if (!Array.isArray(nodes)) {
    nodes = [nodes];
  }
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.original) {
      var partNode = this.partNodes[node.original.metadata['index']];
      if (partNode) {
        objects.push(partNode);
      }
    }
  }
  return objects;
};

MeshHierarchyPanel.prototype.__computePartNodes = function (root) {
  var partNodes = [];
  var filterEmptyGeometries = this.filterEmptyGeometries;
  var showMultiMaterial = this.showMultiMaterial;

  Object3DUtil.traverse(root, function (node) {
    var nfaces = node.userData.nfaces;
    if (filterEmptyGeometries) {
      if (!nfaces) return false;
    }
    partNodes.push(node);

    if (node instanceof THREE.Mesh) {
      var nmats = (node.material instanceof THREE.MultiMaterial) ? node.material.materials.length : 1;
      if (showMultiMaterial && nmats > 1) {
        for (var i = 0; i < nmats; i++) {
          partNodes.push({ node: node, materialIndex: i });
        }
      }
    }
    return true;
  }, function(node) {
    var maxChildLevel = -1;
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        var c = node.children[i];
        maxChildLevel = Math.max(maxChildLevel, c.userData.level);
      }
    }
    node.userData.level = maxChildLevel + 1;
  });
  this.partNodes = partNodes;
};

MeshHierarchyPanel.prototype.clearHighlighting = function() {
  this.dehighlightPart(this.partsNode);
};

MeshHierarchyPanel.prototype.refreshHighlighting = function() {
  this.dehighlightPart(this.partsNode);
  var selected = this.getSelectedPartNodes();
  if (selected && selected.length) {
    for (var i = 0; i < selected.length; i++) {
      this.highlightPart(selected[i]);
    }
  }
};

MeshHierarchyPanel.prototype.clear = function () {
  if (this.partsNode && this.partsNode.parent) {
    this.partsNode.parent.remove(this.partsNode);
  }
  this.partsNode = null;
  this.partNodes = null;
  this.treePanel.empty();
};

MeshHierarchyPanel.prototype.setPartMaterial = function (part, mat, filter) {
  Object3DUtil.applyPartMaterial(part, mat, true, true, filter);
};

MeshHierarchyPanel.prototype.__getPartMaterial = function(part, useColor) {
  var color = part.userData.color;
  if (useColor && color) {
    return color;
  } else if (this.useSpecialMaterial) {
    return this.specialMaterial;
  } else {
    var origMaterial = part.cachedData? part.cachedData.origMaterial : null;
    return origMaterial || this.specialMaterial;
  }
};


MeshHierarchyPanel.prototype.dehighlightPart = function (part) {
  if (part) {
    if (this.highlightByHidingOthers) {
      this.showParts(true);
    } else {
      var scope = this;
      this.setPartMaterial(part, function(node) { return scope.__getPartMaterial(node, true); });
    }
  }
};

//Highlights a particular part of the model
MeshHierarchyPanel.prototype.highlightPart = function (part) {
  if (part) {
    if (this.highlightByHidingOthers) {
      this.showPartOnly(part, true);
    } else {
      if (this.highlightMaterial === 'original') {
        this.setPartMaterial(part, function(node) {
          var material = node.cachedData? node.cachedData.origMaterial : null;
          return material;
        });
      } else {
        this.setPartMaterial(part, this.highlightMaterial);
      }
      Object3DUtil.setVisible(this.partsNode, true);
    }
  }
};

//Colors a particular part of the model
MeshHierarchyPanel.prototype.colorPart = function (part, colorMaterial, filter) {
  if (part) {
    this.setPartMaterial(part, colorMaterial, filter);
    Object3DUtil.setVisible(this.partsNode, true);
  }
};

MeshHierarchyPanel.prototype.showParts = function (bool) {
  if (bool) { //Show selected part
    Object3DUtil.setVisible(this.partsNode, true);
  } else {
    Object3DUtil.setVisible(this.partsNode, false);
  }
};

MeshHierarchyPanel.prototype.showPartOnly = function(part, flag) {
  if (part) {
    var root = this.partsNode;
    if (part !== this.partsNode && flag) {
      // set other parts to be not visible
      var obj = part;
      Object3DUtil.traverseAncestors(part, function(p) {
        for (var i = 0; i < p.children.length; i++) {
          if (p.children[i] !== obj) {
            Object3DUtil.setVisible(p.children[i], false);
          } else {
            Object3DUtil.setVisible(p.children[i], true);
          }
        }
        obj = p;
        return (p !== root);
      });
    }
    // Show visibility of part
    Object3DUtil.setVisible(part, flag, true);
  }
};

//Decolors a particular part of the model
MeshHierarchyPanel.prototype.decolorPart = function (part) {
  if (part) {
    var scope = this;
    this.setPartMaterial(part, function(node) { return scope.__getPartMaterial(node, false); });
  }
};

module.exports = MeshHierarchyPanel;