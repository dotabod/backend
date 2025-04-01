"use strict";
// eff0f5a41304bded1f7286c921a66947e3f5a6243d55c8aa3316582983edef87f61a7254897d7d607863371538269eb6c364273f76a877d09b204da66e945c2d  scripts/regions.txt
// not much value writing automation to extract this info. It can be extracted via:
// vpk game/dota/pak01_dir.vpk -f 'scripts/regions.txt' -p
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerRegion = void 0;
var ServerRegion;
(function (ServerRegion) {
    ServerRegion[ServerRegion["Unspecified"] = 0] = "Unspecified";
    ServerRegion[ServerRegion["USWest"] = 1] = "USWest";
    ServerRegion[ServerRegion["USEast"] = 2] = "USEast";
    ServerRegion[ServerRegion["Europe"] = 3] = "Europe";
    ServerRegion[ServerRegion["Korea"] = 4] = "Korea";
    ServerRegion[ServerRegion["Singapore"] = 5] = "Singapore";
    ServerRegion[ServerRegion["Dubai"] = 6] = "Dubai";
    ServerRegion[ServerRegion["PerfectWorldTelecom"] = 12] = "PerfectWorldTelecom";
    ServerRegion[ServerRegion["PerfectWorldTelecomGuangdong"] = 17] = "PerfectWorldTelecomGuangdong";
    ServerRegion[ServerRegion["PerfectWorldTelecomZhejiang"] = 18] = "PerfectWorldTelecomZhejiang";
    ServerRegion[ServerRegion["PerfectWorldTelecomWuhan"] = 20] = "PerfectWorldTelecomWuhan";
    ServerRegion[ServerRegion["PerfectWorldUnicom"] = 13] = "PerfectWorldUnicom";
    ServerRegion[ServerRegion["PerfectWorldUnicomTianjin"] = 25] = "PerfectWorldUnicomTianjin";
    ServerRegion[ServerRegion["Stockholm"] = 8] = "Stockholm";
    ServerRegion[ServerRegion["Brazil"] = 10] = "Brazil";
    ServerRegion[ServerRegion["Austria"] = 9] = "Austria";
    ServerRegion[ServerRegion["Australia"] = 7] = "Australia";
    ServerRegion[ServerRegion["SouthAfrica"] = 11] = "SouthAfrica";
    ServerRegion[ServerRegion["Chile"] = 14] = "Chile";
    ServerRegion[ServerRegion["Peru"] = 15] = "Peru";
    ServerRegion[ServerRegion["Argentina"] = 38] = "Argentina";
    ServerRegion[ServerRegion["India"] = 16] = "India";
    ServerRegion[ServerRegion["Japan"] = 19] = "Japan";
    ServerRegion[ServerRegion["Taiwan"] = 37] = "Taiwan";
})(ServerRegion || (exports.ServerRegion = ServerRegion = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VydmVyUmVnaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2VudW1zL1NlcnZlclJlZ2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsd0pBQXdKO0FBQ3hKLG1GQUFtRjtBQUNuRiwwREFBMEQ7OztBQUUxRCxJQUFZLFlBeUJYO0FBekJELFdBQVksWUFBWTtJQUNwQiw2REFBZSxDQUFBO0lBQ2YsbURBQVUsQ0FBQTtJQUNWLG1EQUFVLENBQUE7SUFDVixtREFBVSxDQUFBO0lBQ1YsaURBQVMsQ0FBQTtJQUNULHlEQUFhLENBQUE7SUFDYixpREFBUyxDQUFBO0lBQ1QsOEVBQXdCLENBQUE7SUFDeEIsZ0dBQWlDLENBQUE7SUFDakMsOEZBQWdDLENBQUE7SUFDaEMsd0ZBQTZCLENBQUE7SUFDN0IsNEVBQXVCLENBQUE7SUFDdkIsMEZBQThCLENBQUE7SUFDOUIseURBQWEsQ0FBQTtJQUNiLG9EQUFXLENBQUE7SUFDWCxxREFBVyxDQUFBO0lBQ1gseURBQWEsQ0FBQTtJQUNiLDhEQUFnQixDQUFBO0lBQ2hCLGtEQUFVLENBQUE7SUFDVixnREFBUyxDQUFBO0lBQ1QsMERBQWMsQ0FBQTtJQUNkLGtEQUFVLENBQUE7SUFDVixrREFBVSxDQUFBO0lBQ1Ysb0RBQVcsQ0FBQTtBQUNmLENBQUMsRUF6QlcsWUFBWSw0QkFBWixZQUFZLFFBeUJ2QiJ9