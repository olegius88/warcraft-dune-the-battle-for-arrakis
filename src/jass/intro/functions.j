// Intro map (src/emperor/intro.ts): shows its movies (movie/player.j), then goes on: to the next
// map of the campaign (a house's start mission) or, with none, back to the campaign screen.
// Autotest builds report the visit like the other maps (DuneTest\<name>.pld).
{{movieFunctions}}
function EmpIntroDone takes nothing returns nothing
{{#if autoReport}}    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("intro done")
    call PreloadGenEnd({{str autoReport}})
{{/if}}{{#if next}}    call SetNextLevelBJ({{str next}})
{{/if}}    call CustomVictoryBJ(Player(0), false, false)
endfunction

function EmpIntroStart takes nothing returns nothing
    call FogEnable(false)
    call FogMaskEnable(false)
    call EmpMovieData()
{{movieAdds}}
    call EmpMoviePlay(function EmpIntroDone)
endfunction
