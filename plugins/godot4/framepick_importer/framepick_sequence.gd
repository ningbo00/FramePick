@tool
class_name FramePickSequence
extends Resource

@export var sprite_frames: SpriteFrames
@export var frame_delays_ms: PackedInt32Array
@export var node_animation: Animation
@export var animation_library: AnimationLibrary
@export var animation_library_path := ""
@export var node_animation_enabled := false
@export var loop := true
@export var canvas_size := Vector2i.ZERO
@export var source_canvas_size := Vector2i.ZERO
@export var content_offset := Vector2i.ZERO
@export var source_manifest: Dictionary = {}
