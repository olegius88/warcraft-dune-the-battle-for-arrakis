    // (zoom 0..100, ticks): 0 = nearest, 100 = furthest
    call SetCameraFieldForPlayer(Player(0), CAMERA_FIELD_TARGET_DISTANCE, {{real RT.CAMERA_ZOOM_NEAR}} + ({{real RT.CAMERA_ZOOM_FAR}} - {{real RT.CAMERA_ZOOM_NEAR}}) * I2R(IMinBJ(IMaxBJ(a1, 0), 100)) / 100.0, I2R(IMaxBJ(a2, 1)) / {{TPS}})
