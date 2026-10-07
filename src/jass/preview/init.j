function PreviewInit takes nothing returns nothing
    call CreateNUnitsAtLoc( {{PREVIEW_FOOTMEN}}, '{{UNIT.fallback}}', Player(0), Location({{real bx}}, {{real by}}), {{real DEFAULT_FACING}} )
{{markerLines}}
    call FogEnableOff()
    call FogMaskEnableOff()
    call SetTimeOfDay( {{real TIME_OF_DAY}} )
    call SuspendTimeOfDay( true )
    call SetCameraField( CAMERA_FIELD_TARGET_DISTANCE, {{real PREVIEW_CAMERA_DISTANCE}}, 0.0 )
    call SetCameraPosition( {{real bx}}, {{real by}} )
endfunction
