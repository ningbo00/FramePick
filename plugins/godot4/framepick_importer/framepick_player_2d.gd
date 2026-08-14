@tool
extends AnimatedSprite2D

@export var sequence: FramePickSequence:
	set(value):
		sequence = value
		if is_inside_tree():
			call_deferred("_apply_sequence")
@export var autoplay_frames := true
@export var autoplay_node_animation := true


func _ready() -> void:
	_apply_sequence()


func play_framepick() -> void:
	_apply_sequence(true)


func stop_framepick() -> void:
	stop()
	var player := get_node_or_null("_FramePickMotion") as AnimationPlayer
	if player != null:
		player.stop()


func _apply_sequence(force_play := false) -> void:
	if sequence == null:
		return
	sprite_frames = sequence.sprite_frames
	animation = &"default"
	centered = true
	if autoplay_frames or force_play:
		play(&"default")
	var player := _motion_player()
	if player.has_animation_library(&"framepick"):
		player.remove_animation_library(&"framepick")
	var library := AnimationLibrary.new()
	if sequence.node_animation != null:
		library.add_animation(&"motion", sequence.node_animation)
	player.add_animation_library(&"framepick", library)
	if not Engine.is_editor_hint() and sequence.node_animation_enabled and (autoplay_node_animation or force_play):
		player.play(&"framepick/motion")


func _motion_player() -> AnimationPlayer:
	var player := get_node_or_null("_FramePickMotion") as AnimationPlayer
	if player != null:
		return player
	player = AnimationPlayer.new()
	player.name = "_FramePickMotion"
	player.root_node = NodePath("..")
	add_child(player, false, Node.INTERNAL_MODE_BACK)
	return player
