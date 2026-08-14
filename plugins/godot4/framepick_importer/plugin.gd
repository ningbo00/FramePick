@tool
extends EditorPlugin

var _importer: EditorImportPlugin


func _enter_tree() -> void:
	_importer = preload("framepick_import_plugin.gd").new()
	add_import_plugin(_importer)
	add_custom_type(
		"FramePickPlayer2D",
		"AnimatedSprite2D",
		preload("framepick_player_2d.gd"),
		null
	)
	add_custom_type(
		"FramePickSequenceController",
		"Node",
		preload("framepick_sequence_controller.gd"),
		null
	)


func _exit_tree() -> void:
	remove_custom_type("FramePickSequenceController")
	remove_custom_type("FramePickPlayer2D")
	if _importer != null:
		remove_import_plugin(_importer)
		_importer = null
