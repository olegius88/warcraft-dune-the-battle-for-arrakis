function W takes nothing returns nothing
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload( {{str text}} )
    call PreloadGenEnd( {{str file}} )
endfunction
