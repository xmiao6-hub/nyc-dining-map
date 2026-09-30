# NYC Outdoor Dining Map

An interactive p5.js map visualizing licensed outdoor dining locations across New York City, plotted at their real latitude / longitude on top of real borough geography.

![p5.js](https://img.shields.io/badge/p5.js-1.11.3-blue)

## Features

- 2,433 dining locations from the NYC "Dining Out" dataset, positioned by real lat/lon
- Real NYC borough geography (official boundaries GeoJSON) with waterways
- Color by borough, shape by license type (circle = sidewalk cafe, square = roadway dining)
- Hover any point for restaurant details; click borough chips to toggle; filter by license type
- Animated background: floating food icons that light up and pop like bubbles when touched
- An interactive restaurant illustration that changes with the selected filter

## Run

Double-click `index.html`, or serve locally:

```
python3 -m http.server 8000
```

Then open http://localhost:8000 (serving over http lets the sketch read the live CSV instead of the bundled snapshot).

## Data

- Dining locations: NYC Open Data — "Dining Out" (Outdoor Dining Licenses)
- Borough boundaries: NYC Boroughs GeoJSON (simplified, embedded in `geo.js`)

## Files

- `sketch.js` — the p5.js sketch
- `data.js` — bundled snapshot of the CSV (regenerate with `python3 convert_csv.py`)
- `geo.js` — simplified borough boundary polygons
- `convert_csv.py` — CSV to data.js converter
