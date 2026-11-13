# Array abstraction in the arithmometer overview

The user corrected the full-instance tree: “we can abstract away repeated objects under arrays. I don't want to see 86 objects”. The initial diagram enumerated every dial and lever instance, obscuring the component structure.

Revised the retained builder at computation-site/.luminous/artifacts/arithmometer-tree/build-input.py to retain one representative unit and its descendants per array. Array nodes retain their count and spacing. Source snapshot remains complete. The new diagram has 32 nodes including the overview root and Masters grouping, down from 88.

A new artifact version records the abstraction change. Generation validates the source and measures components. Browser interactions were not exercised. For repeated assemblies, prefer a representative unit with count/spacing when the user's goal is an artistic component overview.

