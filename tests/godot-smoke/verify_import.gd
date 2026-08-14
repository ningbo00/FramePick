extends SceneTree


func _init() -> void:
	var sequence = ResourceLoader.load("res://assets/Hero/Hero.fpseq")
	if sequence == null:
		_fail("imported FramePickSequence resource is missing")
		return
	var delays: PackedInt32Array = sequence.get("frame_delays_ms")
	if delays != PackedInt32Array([83, 125]):
		_fail("frame delay was not preserved: %s" % [delays])
		return
	var sprite_frames: SpriteFrames = sequence.get("sprite_frames")
	if sprite_frames == null or sprite_frames.get_frame_count(&"default") != 2:
		_fail("SpriteFrames was not generated")
		return
	if not is_equal_approx(sprite_frames.get_frame_duration(&"default", 0), 0.996):
		_fail("SpriteFrames duration multiplier is incorrect")
		return
	var node_animation: Animation = sequence.get("node_animation")
	if node_animation == null or node_animation.get_track_count() != 5:
		_fail("whole-node animation tracks were not generated")
		return
	var scale_track := -1
	for track_index in node_animation.get_track_count():
		if node_animation.track_get_path(track_index) == NodePath(".:scale:x"):
			scale_track = track_index
			break
	if scale_track < 0 or node_animation.track_get_key_count(scale_track) != 2:
		_fail("scale Bezier track is missing keys")
		return
	var scale_handle := node_animation.bezier_track_get_key_out_handle(scale_track, 0)
	if not scale_handle.is_equal_approx(Vector2(0.0083, 0.006)):
		_fail("FramePick Bezier controls were not converted correctly: %s" % [scale_handle])
		return
	if sequence.get("node_animation_enabled") != true:
		_fail("whole-node animation enabled state was not preserved")
		return
	var animation_library: AnimationLibrary = sequence.get("animation_library")
	var animation_library_path := str(sequence.get("animation_library_path"))
	if animation_library == null or animation_library_path != "res://assets/Hero/Hero_animations.tres":
		_fail("native AnimationLibrary was not attached to FramePickSequence")
		return
	if not ResourceLoader.exists(animation_library_path):
		_fail("visible native AnimationLibrary was not generated")
		return
	var visible_library := ResourceLoader.load(animation_library_path) as AnimationLibrary
	if visible_library == null or not visible_library.has_animation(&"motion") or not visible_library.has_animation(&"controller"):
		_fail("native motion/controller animations are missing")
		return
	var controller_animation := visible_library.get_animation(&"controller")
	if controller_animation == null or controller_animation.get_track_count() != 6:
		_fail("native controller animation does not contain five curves and one frame track")
		return
	var expected_paths := [
		NodePath(".:framepick_motion_x"),
		NodePath(".:framepick_motion_y"),
		NodePath(".:framepick_motion_scale_x"),
		NodePath(".:framepick_motion_scale_y"),
		NodePath(".:framepick_motion_rotation_degrees"),
		NodePath(".:framepick_frame_index"),
	]
	for track_index in controller_animation.get_track_count():
		if controller_animation.track_get_path(track_index) not in expected_paths:
			_fail("native controller animation contains an unexpected track: %s" % controller_animation.track_get_path(track_index))
			return
	var frame_track := controller_animation.find_track(NodePath(".:framepick_frame_index"), Animation.TYPE_VALUE)
	if frame_track < 0 or controller_animation.track_get_key_count(frame_track) != 2:
		_fail("native frame track did not preserve both frames")
		return
	if not is_equal_approx(controller_animation.track_get_key_time(frame_track, 1), 0.083):
		_fail("native frame track did not preserve the first 83ms delay")
		return
	if not is_equal_approx(controller_animation.length, 0.208):
		_fail("native animation duration did not preserve total frame delay")
		return
	var player_script = ResourceLoader.load("res://addons/framepick_importer/framepick_player_2d.gd")
	var player = player_script.new()
	get_root().add_child(player)
	player.sequence = sequence
	player.play_framepick()
	var motion_player := player.get_node_or_null("_FramePickMotion") as AnimationPlayer
	if player.sprite_frames != sprite_frames or motion_player == null or not motion_player.has_animation(&"framepick/motion"):
		_fail("FramePickPlayer2D did not bind the imported resources")
		return
	player.queue_free()

	var actor := Node2D.new()
	actor.name = "Player"
	get_root().add_child(actor)
	var foot_pivot := Node2D.new()
	foot_pivot.name = "FootPivot"
	foot_pivot.position = Vector2(0.0, 12.0)
	foot_pivot.scale = Vector2(1.5, 0.75)
	foot_pivot.rotation_degrees = 4.0
	actor.add_child(foot_pivot)
	var sprite := Sprite2D.new()
	sprite.name = "Sprite"
	sprite.position = Vector2(0.0, -42.0)
	sprite.scale = Vector2(0.7, 0.7)
	foot_pivot.add_child(sprite)
	var glow := Sprite2D.new()
	glow.name = "MaxStarGlow"
	glow.position = sprite.position
	foot_pivot.add_child(glow)
	var controller_script = ResourceLoader.load("res://addons/framepick_importer/framepick_sequence_controller.gd")
	var controller = controller_script.new()
	controller.name = "FramePickSequenceController"
	actor.add_child(controller)
	controller.frame_target_path = NodePath("../FootPivot/Sprite")
	controller.motion_target_path = NodePath("../FootPivot")
	controller.sequence = sequence
	controller.play_framepick()
	controller.seek_framepick_ms(83.0)
	if foot_pivot.position != Vector2(2.0, 11.0):
		_fail("FootPivot motion did not preserve its base position: %s" % [foot_pivot.position])
		return
	if not foot_pivot.scale.is_equal_approx(Vector2(1.545, 0.7725)):
		_fail("FootPivot motion did not multiply its base scale: %s" % [foot_pivot.scale])
		return
	if not is_equal_approx(foot_pivot.rotation_degrees, 5.0):
		_fail("FootPivot motion did not add to its base rotation: %s" % foot_pivot.rotation_degrees)
		return
	if sprite.position != Vector2(0.0, -42.0) or not sprite.scale.is_equal_approx(Vector2(0.7, 0.7)):
		_fail("FramePick motion overwrote the Sprite2D layout transform")
		return
	if sprite.texture == null:
		_fail("FramePickSequenceController did not assign the sequence texture to Sprite2D")
		return
	if not glow.global_transform.is_equal_approx(foot_pivot.global_transform * glow.transform):
		_fail("FootPivot siblings did not inherit the shared visual transform")
		return
	controller.stop_framepick()
	controller.restore_motion_base()
	controller.set("framepick_motion_x", 1.0)
	controller.call("_apply_native_motion")
	if foot_pivot.position != Vector2(1.0, 12.0):
		_fail("controller native animation property did not apply: position=%s value=%s drive=%s sequence=%s inside=%s target=%s" % [foot_pivot.position, controller.get("framepick_motion_x"), controller.drive_motion_target, controller.sequence != null, controller.is_inside_tree(), controller.get("_bound_motion_target")])
		return
	controller.set("framepick_motion_x", 0.0)
	controller.call("_apply_native_motion")
	var native_player := AnimationPlayer.new()
	native_player.name = "FramePickNativeAnimation"
	controller.add_child(native_player)
	native_player.root_node = NodePath("..")
	native_player.add_animation_library(&"framepick", visible_library)
	native_player.play(&"framepick/controller")
	var native_time := 0.0415
	native_player.advance(native_time)
	controller.call("_process", 0.0)
	var native_values := {
		"x": 0.0,
		"y": 0.0,
		"scale_x": 1.0,
		"scale_y": 1.0,
		"rotation": 0.0,
	}
	for track_index in controller_animation.get_track_count():
		if controller_animation.track_get_type(track_index) != Animation.TYPE_BEZIER:
			continue
		var value := float(controller_animation.bezier_track_interpolate(track_index, native_time))
		match controller_animation.track_get_path(track_index):
			NodePath(".:framepick_motion_x"):
				native_values.x = value
			NodePath(".:framepick_motion_y"):
				native_values.y = value
			NodePath(".:framepick_motion_scale_x"):
				native_values.scale_x = value
			NodePath(".:framepick_motion_scale_y"):
				native_values.scale_y = value
			NodePath(".:framepick_motion_rotation_degrees"):
				native_values.rotation = value
	var expected_position := Vector2(float(native_values.x), 12.0 + float(native_values.y))
	var expected_scale := Vector2(1.5 * float(native_values.scale_x), 0.75 * float(native_values.scale_y))
	var expected_rotation := 4.0 + float(native_values.rotation)
	if not foot_pivot.position.is_equal_approx(expected_position):
		_fail("native controller animation position mismatch: actual=%s expected=%s property=(%s,%s)" % [foot_pivot.position, expected_position, controller.get("framepick_motion_x"), controller.get("framepick_motion_y")])
		return
	if not foot_pivot.scale.is_equal_approx(expected_scale) or not is_equal_approx(foot_pivot.rotation_degrees, expected_rotation):
		_fail("native controller animation did not apply relative scale/rotation")
		return
	native_player.advance(0.06)
	controller.call("_process", 0.0)
	if int(controller.get("framepick_frame_index")) != 1 or sprite.texture != sprite_frames.get_frame_texture(&"default", 1):
		_fail("native controller animation did not switch frames at the 83ms boundary")
		return
	actor.queue_free()
	print("FRAMEPICK_GODOT_IMPORT_OK")
	quit(0)


func _fail(message: String) -> void:
	push_error(message)
	quit(1)
