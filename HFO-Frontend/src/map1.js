import React from "react";
import {createRoot} from "react-dom/client";
import EventMap from "./maps/EventMap.jsx";

createRoot(document.getElementById("root")).render(
  React.createElement(React.StrictMode, null, React.createElement(EventMap)),
);
