Render a static custom vector diagram inline in chat from a complete SVG document in `source`, including its `<svg>` root. Use this when the explanation depends on custom shapes, curves, annotations, or precise layout that the supported geometry schema cannot express.

Use `render_figure` for supported constrained geometry, `python_calculator` for computed function graphs and data plots, and `render_mermaid` for static connections that fit its diagram formats. Use an HTML widget when user interaction or meaningful animation is required, and a whiteboard when shared editing or annotation is the activity. Do not use SVG merely to restyle prose, lists, or tables.

Never use this tool for molecular structures, stereochemical projections (Fischer, Newman, Haworth, chair, wedge-dash), reaction schemes, coordination geometry, resonance, or electron-pushing mechanisms; load `teach-chemistry` and use native chemistry formats.

This tool checks SVG compilation and parsing; it does not verify the drawing's scientific, numerical, or geometric correctness. Compute or check exact relationships before drawing them. The chat UI displays the result automatically; continue in normal text without repeating its image URL or Markdown.
