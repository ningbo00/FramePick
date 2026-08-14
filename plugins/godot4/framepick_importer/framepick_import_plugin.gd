@tool
extends EditorImportPlugin

const FramePickSequenceResource = preload("framepick_sequence.gd")
const DEFAULT_CURVE := [0.42, 0.0, 0.58, 1.0]


func _get_importer_name() -> String:
	return "framepick.sequence"


func _get_visible_name() -> String:
	return "FramePick Sequence"


func _get_recognized_extensions() -> PackedStringArray:
	return PackedStringArray(["fpseq"])


func _get_save_extension() -> String:
	return "res"


func _get_resource_type() -> String:
	# The saved Resource still carries the FramePickSequence script. Declaring the
	# base type keeps imported files loadable before global script classes warm up.
	return "Resource"


func _get_preset_count() -> int:
	return 1


func _get_preset_name(_preset_index: int) -> String:
	return "Default"


func _get_import_options(_path: String, _preset_index: int) -> Array[Dictionary]:
	return []


func _get_import_order() -> int:
	return 100


func _get_priority() -> float:
	return 1.0


func _get_dependencies(path: String, _add_types: bool) -> PackedStringArray:
	var manifest := _read_manifest(path)
	var dependencies := PackedStringArray()
	if manifest.is_empty():
		return dependencies
	for frame in manifest.get("frames", []):
		if frame is Dictionary:
			dependencies.append(_resolve_frame_path(path, str(frame.get("file", ""))))
	return dependencies


func _import(
	source_file: String,
	save_path: String,
	_options: Dictionary,
	_platform_variants: Array[String],
	gen_files: Array[String]
) -> Error:
	var manifest := _read_manifest(source_file)
	var validation_error := _validate_manifest(manifest)
	if not validation_error.is_empty():
		push_error("FramePick import failed: %s" % validation_error)
		return ERR_PARSE_ERROR

	var sprite_frames := SpriteFrames.new()
	sprite_frames.clear(&"default")
	var fps := maxf(float(manifest.get("fps", 12.0)), 0.001)
	var loop_enabled := bool(manifest.get("loop", true))
	sprite_frames.set_animation_speed(&"default", fps)
	sprite_frames.set_animation_loop(&"default", loop_enabled)
	var delays := PackedInt32Array()

	for frame in manifest.get("frames", []):
		var texture_path := _resolve_frame_path(source_file, str(frame.get("file", "")))
		var texture := ResourceLoader.load(texture_path, "Texture2D") as Texture2D
		if texture == null:
			push_error("FramePick frame texture could not be loaded: %s" % texture_path)
			return ERR_FILE_NOT_FOUND
		var delay_ms := maxi(1, int(round(float(frame.get("delayMs", 1)))))
		delays.append(delay_ms)
		# SpriteFrames duration is a multiplier of 1 / animation FPS.
		sprite_frames.add_frame(&"default", texture, maxf(delay_ms * fps / 1000.0, 0.0001))

	var node_animation_data: Dictionary = manifest.get("nodeAnimation", {})
	var total_duration_ms := float(manifest.get("totalDurationMs", 0.0))
	var node_animation := _build_node_animation(node_animation_data, total_duration_ms, loop_enabled)
	var native_motion_animation := _build_controller_animation(node_animation_data, PackedInt32Array(), total_duration_ms, loop_enabled)
	var controller_animation := _build_controller_animation(node_animation_data, delays, total_duration_ms, loop_enabled)
	var animation_library := AnimationLibrary.new()
	animation_library.resource_name = "%s Animations" % str(manifest.get("name", source_file.get_file().get_basename()))
	animation_library.add_animation(&"motion", native_motion_animation)
	animation_library.add_animation(&"controller", controller_animation)
	var animation_library_path := "%s_animations.tres" % source_file.get_basename()
	var library_save_error := ResourceSaver.save(animation_library, animation_library_path)
	if library_save_error != OK:
		push_error("FramePick native AnimationLibrary could not be saved: %s" % animation_library_path)
		return library_save_error
	gen_files.append(animation_library_path)
	var canvas: Dictionary = manifest.get("canvas", {})
	var source_canvas: Dictionary = manifest.get("sourceCanvas", canvas)
	var content_bounds: Dictionary = manifest.get("contentBounds", {})
	var resource := FramePickSequenceResource.new()
	resource.resource_name = str(manifest.get("name", source_file.get_file().get_basename()))
	resource.sprite_frames = sprite_frames
	resource.frame_delays_ms = delays
	resource.node_animation = node_animation
	resource.animation_library = animation_library
	resource.animation_library_path = animation_library_path
	resource.node_animation_enabled = bool(node_animation_data.get("enabled", false))
	resource.loop = loop_enabled
	resource.canvas_size = Vector2i(int(canvas.get("width", 0)), int(canvas.get("height", 0)))
	resource.source_canvas_size = Vector2i(int(source_canvas.get("width", 0)), int(source_canvas.get("height", 0)))
	resource.content_offset = Vector2i(int(content_bounds.get("x", 0)), int(content_bounds.get("y", 0)))
	resource.source_manifest = manifest
	return ResourceSaver.save(resource, "%s.%s" % [save_path, _get_save_extension()])


func _read_manifest(path: String) -> Dictionary:
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}


func _validate_manifest(manifest: Dictionary) -> String:
	if manifest.get("format") != "framepick-godot-sequence" or int(manifest.get("schemaVersion", 0)) != 1:
		return "unsupported .fpseq format"
	var frames = manifest.get("frames", [])
	if not frames is Array or frames.is_empty() or int(manifest.get("frameCount", -1)) != frames.size():
		return "frame list is empty or inconsistent"
	for index in frames.size():
		var frame = frames[index]
		if not frame is Dictionary or int(frame.get("index", -1)) != index or float(frame.get("delayMs", 0.0)) <= 0.0:
			return "frame %d is invalid" % (index + 1)
		var relative_path := str(frame.get("file", ""))
		if not relative_path.begins_with("frames/frame_") or not relative_path.ends_with(".png"):
			return "frame %d path is invalid" % (index + 1)
	return ""


func _resolve_frame_path(source_file: String, relative_path: String) -> String:
	return source_file.get_base_dir().path_join(relative_path).simplify_path()


func _build_node_animation(data: Dictionary, duration_ms: float, loop_enabled: bool) -> Animation:
	var animation := Animation.new()
	var keyframes: Array = data.get("keyframes", [])
	var last_key_time := float(keyframes.back().get("timeMs", 0.0)) if not keyframes.is_empty() else 0.0
	animation.length = maxf(maxf(duration_ms, last_key_time) / 1000.0, 0.001)
	animation.loop_mode = Animation.LOOP_LINEAR if loop_enabled else Animation.LOOP_NONE
	_add_bezier_track(animation, NodePath(".:position:x"), keyframes, "x", 1.0)
	_add_bezier_track(animation, NodePath(".:position:y"), keyframes, "y", 1.0)
	_add_bezier_track(animation, NodePath(".:scale:x"), keyframes, "scale", 0.01)
	_add_bezier_track(animation, NodePath(".:scale:y"), keyframes, "scale", 0.01)
	_add_bezier_track(animation, NodePath(".:rotation_degrees"), keyframes, "rotate", 1.0)
	return animation


func _build_controller_animation(data: Dictionary, delays: PackedInt32Array, duration_ms: float, loop_enabled: bool) -> Animation:
	var animation := Animation.new()
	var keyframes: Array = data.get("keyframes", [])
	var last_key_time := float(keyframes.back().get("timeMs", 0.0)) if not keyframes.is_empty() else 0.0
	animation.length = maxf(maxf(duration_ms, last_key_time) / 1000.0, 0.001)
	animation.loop_mode = Animation.LOOP_LINEAR if loop_enabled else Animation.LOOP_NONE
	if bool(data.get("enabled", false)):
		_add_bezier_track(animation, NodePath(".:framepick_motion_x"), keyframes, "x", 1.0)
		_add_bezier_track(animation, NodePath(".:framepick_motion_y"), keyframes, "y", 1.0)
		_add_bezier_track(animation, NodePath(".:framepick_motion_scale_x"), keyframes, "scale", 0.01)
		_add_bezier_track(animation, NodePath(".:framepick_motion_scale_y"), keyframes, "scale", 0.01)
		_add_bezier_track(animation, NodePath(".:framepick_motion_rotation_degrees"), keyframes, "rotate", 1.0)
	_add_frame_track(animation, delays)
	return animation


func _add_frame_track(animation: Animation, delays: PackedInt32Array) -> void:
	if delays.is_empty():
		return
	var track_index := animation.add_track(Animation.TYPE_VALUE)
	animation.track_set_path(track_index, NodePath(".:framepick_frame_index"))
	animation.value_track_set_update_mode(track_index, Animation.UPDATE_DISCRETE)
	animation.track_set_interpolation_type(track_index, Animation.INTERPOLATION_NEAREST)
	var cursor_ms := 0.0
	for frame_index in delays.size():
		animation.track_insert_key(track_index, cursor_ms / 1000.0, frame_index)
		cursor_ms += maxf(float(delays[frame_index]), 1.0)


func _add_bezier_track(animation: Animation, property_path: NodePath, keyframes: Array, property_name: String, value_scale: float) -> void:
	if keyframes.is_empty():
		return
	var track_index := animation.add_track(Animation.TYPE_BEZIER)
	animation.track_set_path(track_index, property_path)
	for index in keyframes.size():
		var keyframe: Dictionary = keyframes[index]
		var time := float(keyframe.get("timeMs", 0.0)) / 1000.0
		var value := float(keyframe.get(property_name, 0.0)) * value_scale
		var in_handle := Vector2.ZERO
		var out_handle := Vector2.ZERO
		if index > 0:
			var previous: Dictionary = keyframes[index - 1]
			var previous_value := float(previous.get(property_name, 0.0)) * value_scale
			var duration := time - float(previous.get("timeMs", 0.0)) / 1000.0
			var curve := _curve(previous)
			in_handle = Vector2(-(1.0 - curve[2]) * duration, -(1.0 - curve[3]) * (value - previous_value))
		if index + 1 < keyframes.size():
			var following: Dictionary = keyframes[index + 1]
			var following_time := float(following.get("timeMs", 0.0)) / 1000.0
			var following_value := float(following.get(property_name, 0.0)) * value_scale
			var duration := following_time - time
			var curve := _curve(keyframe)
			out_handle = Vector2(curve[0] * duration, curve[1] * (following_value - value))
		animation.bezier_track_insert_key(track_index, time, value, in_handle, out_handle)


func _curve(keyframe: Dictionary) -> Array:
	var curve = keyframe.get("bezier", DEFAULT_CURVE)
	return curve if curve is Array and curve.size() == 4 else DEFAULT_CURVE
