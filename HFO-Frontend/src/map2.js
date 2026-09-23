import React from "react";
import {createRoot} from "react-dom/client";
import RouteFlowMap from "./maps/RouteFlowMap.jsx";

createRoot(document.getElementById("root")).render(
  React.createElement(React.StrictMode, null, React.createElement(RouteFlowMap)),
);
