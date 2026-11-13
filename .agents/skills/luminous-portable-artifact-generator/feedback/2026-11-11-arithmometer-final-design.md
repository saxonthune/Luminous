# Component design instead of scene inventory

The user requested the final intended tree, extended down to foundational components, to reason about the design before implementation. They also requested master colors on derived nodes linked to masters.

The previous overview mirrored the Blender blockout. Version 3 uses a component-design input at computation-site/.luminous/artifacts/arithmometer-tree/build-design.py, preserves representative array units, places master-linked knob/base/tab directly in the lever subtree, and extends those into construction shapes. Proposed roots for unfinished parts are explicitly marked for review rather than asserted as implemented. The same gold palette identifies master-linked components. Current slider values remain captured from scene.json.

Generation checks the document. Interactive browser behavior is not tested. The design snapshot is read-only and is not a live Blender control surface.
