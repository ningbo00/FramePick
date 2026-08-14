@tool
extends AnimationPlayer

const LIBRARY_NAME := &"framepick"

@export var sequence: FramePickSequence:
	set(value):
		sequence = value
		_refresh_library()
@export var inherit_parent_sequence := true
@export var play_on_ready := false
@export_enum("controller", "motion") var startup_animation := "controller"

var _bound_sequence: FramePickSequence


func _enter_tree() -> void:
	set_process(true)
	_refresh_library()


func _ready() -> void:
	_refresh_library()
	if not Engine.is_editor_hint() and play_on_ready and has_animation(_animation_path(startup_animation)):
		play(_animation_path(startup_animation))


func _process(_delta: float) -> void:
	var desired := _desired_sequence()
	if desired != _bound_sequence:
		_refresh_library()


func preview_controller() -> void:
	_refresh_library()
	if has_animation(&"framepick/controller"):
		play(&"framepick/controller")


func preview_motion() -> void:
	_refresh_library()
	if has_animation(&"framepick/motion"):
		play(&"framepick/motion")


func _refresh_library() -> void:
	root_node = NodePath("..")
	var desired := _desired_sequence()
	if desired == _bound_sequence and has_animation_library(LIBRARY_NAME):
		return
	if has_animation_library(LIBRARY_NAME):
		remove_animation_library(LIBRARY_NAME)
	_bound_sequence = desired
	if desired != null and desired.animation_library != null:
		add_animation_library(LIBRARY_NAME, desired.animation_library)


func _desired_sequence() -> FramePickSequence:
	if sequence != null:
		return sequence
	if not inherit_parent_sequence:
		return null
	var parent := get_parent()
	if parent == null or not _has_property(parent, &"sequence"):
		return null
	return parent.get(&"sequence") as FramePickSequence


func _has_property(object: Object, property_name: StringName) -> bool:
	for property in object.get_property_list():
		if property.name == property_name:
			return true
	return false


func _animation_path(animation_name: String) -> StringName:
	return StringName("framepick/%s" % animation_name)
