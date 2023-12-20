export var DotaEventTypes;
(function (DotaEventTypes) {
    DotaEventTypes["RoshanKilled"] = "roshan_killed";
    DotaEventTypes["AegisPickedUp"] = "aegis_picked_up";
    DotaEventTypes["AegisDenied"] = "aegis_denied";
    DotaEventTypes["Tip"] = "tip";
    DotaEventTypes["BountyPickup"] = "bounty_rune_pickup";
    DotaEventTypes["CourierKilled"] = "courier_killed";
})(DotaEventTypes || (DotaEventTypes = {}));
export const validEventTypes = new Set(Object.values(DotaEventTypes));
//# sourceMappingURL=types.js.map