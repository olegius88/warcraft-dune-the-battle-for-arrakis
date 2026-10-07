function Hop takes nothing returns nothing
{{#if direct}}    call ChangeLevel( {{str target}}, false ){{else}}    call SetNextLevelBJ( {{str target}} )
    call CustomVictoryBJ( Player(0), false, false ){{/if}}
endfunction
