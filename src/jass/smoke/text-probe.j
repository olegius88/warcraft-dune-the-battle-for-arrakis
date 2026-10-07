// Subtitle text probe (src/smoke/build-text-probe.ts): which way of making a UI text frame shows
// Cyrillic text over a full-screen backdrop in 1.31.1? Rows from the top: a TEXT frame by type with
// BlzFrameSetFont, a TEXT frame by type without a font, a frame from the stock template
// "EscMenuLabelTextTemplate", and the game's own text messages (DisplayTimedTextToPlayer).
function TextProbeMake takes string kind, real y, string s returns nothing
    local framehandle ui = BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0)
    local framehandle f
    if kind == "template" then
        set f = BlzCreateFrame("EscMenuLabelTextTemplate", ui, 0, 0)
    else
        set f = BlzCreateFrameByType("TEXT", "EmpTextProbe", ui, "", 0)
    endif
    if kind == "font" then
        call BlzFrameSetFont(f, {{str font}}, {{real height}}, 0)
    endif
    call BlzFrameSetAbsPoint(f, FRAMEPOINT_TOPLEFT, 0.05, y)
    call BlzFrameSetAbsPoint(f, FRAMEPOINT_BOTTOMRIGHT, 0.75, y - 0.08)
    call BlzFrameSetTextAlignment(f, TEXT_JUSTIFY_CENTER, TEXT_JUSTIFY_MIDDLE)
    call BlzFrameSetText(f, s)
endfunction

function TextProbeRun takes nothing returns nothing
    local framehandle b = BlzCreateFrameByType("BACKDROP", "EmpTextProbeBack", BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0), "", 0)
    call BlzHideOriginFrames(true)
    call BlzFrameSetAbsPoint(b, FRAMEPOINT_TOPLEFT, 0.0, 0.6)
    call BlzFrameSetAbsPoint(b, FRAMEPOINT_BOTTOMRIGHT, 0.8, 0.0)
    call BlzFrameSetTexture(b, {{str back}}, 0, true)
    call TextProbeMake("font", 0.58, "1 шрифт: Мы должны также учесть имперских сардаукаров.")
    call TextProbeMake("plain", 0.46, "2 без шрифта: Мы должны также учесть имперских сардаукаров.")
    call TextProbeMake("template", 0.34, "3 шаблон: Мы должны также учесть имперских сардаукаров.")
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 30.0, "4 сообщение: Мы должны также учесть имперских сардаукаров.")
endfunction
