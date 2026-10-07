function SmokeLog takes string file, string line returns nothing
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload( line )
    call PreloadGenEnd( "DuneSmoke\\" + file )
endfunction
