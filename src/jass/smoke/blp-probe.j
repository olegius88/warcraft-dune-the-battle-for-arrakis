// BLP texture probe: four backdrops, one per quarter of the 4:3 screen area (0.8 x 0.6), each with
// another encoding of the same movie frame (src/smoke/build-blp-probe.ts). Which ones does the game
// draw right, and does a backdrop fill the rectangle it is given?
function BlpProbeQuad takes integer i, real x, real y, string tex returns nothing
    local framehandle f = BlzCreateFrameByType("BACKDROP", "EmpBlpProbe", BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0), "", i)
    call BlzFrameSetAbsPoint(f, FRAMEPOINT_TOPLEFT, x, y)
    call BlzFrameSetAbsPoint(f, FRAMEPOINT_BOTTOMRIGHT, x + 0.4, y - 0.3)
    call BlzFrameSetTexture(f, tex, 0, true)
endfunction

function BlpProbeRun takes nothing returns nothing
    call BlzHideOriginFrames(true)
    call BlpProbeQuad(0, 0.0, 0.6, {{str tex.0}})
    call BlpProbeQuad(1, 0.4, 0.6, {{str tex.1}})
    call BlpProbeQuad(2, 0.0, 0.3, {{str tex.2}})
    call BlpProbeQuad(3, 0.4, 0.3, {{str tex.3}})
endfunction
