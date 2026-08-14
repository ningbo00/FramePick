@tool
extends Node

signal frame_changed(frame_index: int)
signal playback_finished

@export var sequence: FramePickSequence:
	set(value):
		sequence = value
		_last_frame_index = -1
		if is_inside_tree():
			call_deferred("_apply_sequence")
@export_node_path("Sprite2D") var frame_target_path: NodePath:
	set(value):
		frame_target_path = value
		_bound_frame_target = null
		_last_frame_index = -1
@export_node_path("Node2D") var motion_target_path: NodePath:
	set(value):
		_restore_motion_base()
		motion_target_path = value
		_bound_motion_target = null
@export var autoplay := true
@export var drive_frame_target := true
@export var drive_motion_target := true

@export_storage var framepick_frame_index := 0
@export_storage var framepick_motion_x := 0.0
@export_storage var framepick_motion_y := 0.0
@export_storage var framepick_motion_scale_x := 1.0
@export_storage var framepick_motion_scale_y := 1.0
@export_storage var framepick_motion_rotation_degrees := 0.0

var _playing := false
var _playhead_ms := 0.0
var _last_frame_index := -1
var _bound_frame_target: Sprite2D
var _bound_motion_target: Node2D
var _base_position := Vector2.ZERO
var _base_scale := Vector2.ONE
var _base_rotation := 0.0


func _ready() -> void:
	process_priority = 1
	set_process(true)
	_apply_sequence()


func _process(delta: float) -> void:
	if sequence == null:
		return
	if not _playing:
		_apply_native_frame()
		_apply_native_motion()
		return
	var duration_ms := _duration_ms()
	if duration_ms <= 0.0:
		return
	_playhead_ms += delta * 1000.0
	if sequence.loop:
		_playhead_ms = fposmod(_playhead_ms, duration_ms)
	else:
		_playhead_ms = minf(_playhead_ms, duration_ms)
	_apply_at_time(_playhead_ms)
	if not sequence.loop and _playhead_ms >= duration_ms:
		_playing = false
		playback_finished.emit()


func play_framepick(restart := true) -> void:
	if sequence == null:
		return
	_prepare_bindings()
	if restart:
		_playhead_ms = 0.0
		_last_frame_index = -1
	_apply_at_time(_playhead_ms)
	_playing = true
	set_process(not Engine.is_editor_hint())


func resume_framepick() -> void:
	play_framepick(false)


func stop_framepick(reset_to_start := false) -> void:
	_playing = false
	if reset_to_start:
		seek_framepick_ms(0.0)


func seek_framepick_ms(time_ms: float) -> void:
	if sequence == null:
		return
	_prepare_bindings()
	_playhead_ms = clampf(time_ms, 0.0, _duration_ms())
	_apply_at_time(_playhead_ms)


func is_framepick_playing() -> bool:
	return _playing


func capture_motion_base() -> void:
	_bound_motion_target = null
	_prepare_motion_target()
	_apply_motion(_playhead_ms)


func restore_motion_base() -> void:
	_restore_motion_base()


func _apply_sequence() -> void:
	if sequence == null:
		_playing = false
		return
	_prepare_bindings()
	_playhead_ms = 0.0
	_last_frame_index = -1
	_apply_at_time(0.0)
	if autoplay and not Engine.is_editor_hint():
		play_framepick()


func _prepare_bindings() -> void:
	_prepare_frame_target()
	_prepare_motion_target()


func _prepare_frame_target() -> void:
	var target := get_node_or_null(frame_target_path) as Sprite2D
	if target != _bound_frame_target:
		_bound_frame_target = target
		_last_frame_index = -1


func _prepare_motion_target() -> void:
	var target := get_node_or_null(motion_target_path) as Node2D
	if target == _bound_motion_target:
		return
	_restore_motion_base()
	_bound_motion_target = target
	if target != null:
		_base_position = target.position
		_base_scale = target.scale
		_base_rotation = target.rotation


func _restore_motion_base() -> void:
	if is_instance_valid(_bound_motion_target):
		_bound_motion_target.position = _base_position
		_bound_motion_target.scale = _base_scale
		_bound_motion_target.rotation = _base_rotation


func _apply_at_time(time_ms: float) -> void:
	if drive_frame_target:
		_apply_frame(time_ms)
	if drive_motion_target:
		_apply_motion(time_ms)


func _apply_frame(time_ms: float) -> void:
	if _bound_frame_target == null or sequence.sprite_frames == null:
		return
	var frame_index := _frame_index_at(time_ms)
	_apply_frame_index(frame_index)


func _apply_frame_index(frame_index: int) -> void:
	if _bound_frame_target == null or sequence == null or sequence.sprite_frames == null:
		return
	if frame_index == _last_frame_index:
		return
	var frame_count := sequence.sprite_frames.get_frame_count(&"default")
	if frame_index < 0 or frame_index >= frame_count:
		return
	_bound_frame_target.texture = sequence.sprite_frames.get_frame_texture(&"default", frame_index)
	_last_frame_index = frame_index
	frame_changed.emit(frame_index)


func _apply_native_frame() -> void:
	if not drive_frame_target or sequence == null:
		return
	_prepare_frame_target()
	_apply_frame_index(framepick_frame_index)


func _apply_native_motion() -> void:
	if not drive_motion_target or sequence == null:
		return
	_prepare_motion_target()
	if _bound_motion_target == null:
		return
	_bound_motion_target.position = _base_position + Vector2(framepick_motion_x, framepick_motion_y)
	_bound_motion_target.scale = _base_scale * Vector2(framepick_motion_scale_x, framepick_motion_scale_y)
	_bound_motion_target.rotation = _base_rotation + deg_to_rad(framepick_motion_rotation_degrees)


func _frame_index_at(time_ms: float) -> int:
	var delays := sequence.frame_delays_ms
	if delays.is_empty():
		return 0
	var cursor := 0.0
	for index in delays.size():
		cursor += maxf(float(delays[index]), 1.0)
		if time_ms < cursor:
			return index
	return delays.size() - 1


func _apply_motion(time_ms: float) -> void:
	if _bound_motion_target == null:
		return
	var animation := sequence.node_animation
	if not sequence.node_animation_enabled or animation == null:
		_bound_motion_target.position = _base_position
		_bound_motion_target.scale = _base_scale
		_bound_motion_target.rotation = _base_rotation
		return
	var values := {
		"position_x": 0.0,
		"position_y": 0.0,
		"scale_x": 1.0,
		"scale_y": 1.0,
		"rotation_degrees": 0.0,
	}
	var time_seconds := clampf(time_ms / 1000.0, 0.0, animation.length)
	for track_index in animation.get_track_count():
		if animation.track_get_type(track_index) != Animation.TYPE_BEZIER:
			continue
		var value := float(animation.bezier_track_interpolate(track_index, time_seconds))
		match animation.track_get_path(track_index):
			NodePath(".:position:x"):
				values.position_x = value
			NodePath(".:position:y"):
				values.position_y = value
			NodePath(".:scale:x"):
				values.scale_x = value
			NodePath(".:scale:y"):
				values.scale_y = value
			NodePath(".:rotation_degrees"):
				values.rotation_degrees = value
	_bound_motion_target.position = _base_position + Vector2(values.position_x, values.position_y)
	_bound_motion_target.scale = _base_scale * Vector2(values.scale_x, values.scale_y)
	_bound_motion_target.rotation = _base_rotation + deg_to_rad(values.rotation_degrees)


func _duration_ms() -> float:
	if sequence == null:
		return 0.0
	var total := 0.0
	for delay_ms in sequence.frame_delays_ms:
		total += maxf(float(delay_ms), 1.0)
	if total <= 0.0 and sequence.node_animation != null:
		total = sequence.node_animation.length * 1000.0
	return total
