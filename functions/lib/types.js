"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RADIUS_TOKENS = exports.COST_PER_AI_CALL = exports.View = void 0;
var View;
(function (View) {
    View["Home"] = "home";
    View["Dashboard"] = "dashboard";
    View["Graph"] = "graph";
    View["Help"] = "help";
    View["StyleGuide"] = "styleguide";
    View["Engine"] = "engine";
    View["Analytics"] = "analytics";
})(View || (exports.View = View = {}));
exports.COST_PER_AI_CALL = 0.0015;
exports.RADIUS_TOKENS = {
    frame: "rounded-none", // Structural Brutalist Framing (0px hard borders)
    input: "rounded-xl", // Tactile Interactive Controls (Inputs, drop-downs)
    button: "rounded-lg", // Standard Interactive UI (Clickable utilities)
    toggle: "rounded-xl", // Segmented Component Selectors
};
//# sourceMappingURL=types.js.map