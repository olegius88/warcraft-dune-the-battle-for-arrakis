// Reinforcement pick table (Rules.txt ReinforcementValue / TechLevel of the units, by house: index =
// EmpEnemyHouse numbering) and the [General] timings; the sets themselves: runtime helpers EmpReinf*.
function EmpReinfData takes nothing returns nothing
    set EmpPlayerHouse = {{playerHouse}}
    set EmpReinfDelay = {{reinf.delay}}
    set EmpReinfVariation = {{reinf.variation}}
    set EmpReinfMessage = {{reinf.messageBefore}}
    set EmpReinfInitial = {{reinf.initial}}
    set EmpReinfSubsequent = {{reinf.subsequent}}
{{reinfLines}}
endfunction
