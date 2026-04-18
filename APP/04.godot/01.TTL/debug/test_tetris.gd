extends SceneTree


func _initialize() -> void:
	var scene: TetrisGame = load("res://scenes/main.tscn").instantiate() as TetrisGame
	root.add_child(scene)
	await process_frame
	await process_frame

	scene.debug_fill_row_with_gap(19, 4)
	var ok: bool = scene.debug_spawn_piece_for_test("I", 1, Vector2i(3, 16))
	if not ok:
		push_error("Failed to place test piece.")
		quit(1)
		return

	scene.debug_hard_drop_current_piece()
	await process_frame

	var state: Dictionary = scene.debug_get_state()
	if int(state.lines) < 1:
		push_error("Expected one cleared line, got %s" % [state])
		quit(1)
		return

	if int(state.score) <= 0:
		push_error("Expected score to increase, got %s" % [state.score])
		quit(1)
		return

	print("PASS: TTL Tetris cleared a scripted line.")
	quit(0)
