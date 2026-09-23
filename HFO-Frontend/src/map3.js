import React from "react";
import {createRoot} from "react-dom/client";
import HeatMap from "./maps/HeatMap.jsx";

createRoot(document.getElementById("root")).render(
  React.createElement(React.StrictMode, null, React.createElement(HeatMap)),
);
