extends Node2D

class_name TetrisGame

const BOARD_WIDTH := 10
const BOARD_HEIGHT := 20
const CELL_SIZE := 31.0
const BOARD_OFFSET := Vector2(76.0, 74.0)
const SIDE_PANEL_X := 452.0
const BASE_DROP_INTERVAL := 0.78
const MIN_DROP_INTERVAL := 0.08
const FONT_SIZE_TITLE := 28
const FONT_SIZE_BODY := 20
const COLOR_BG := Color8(7, 12, 22)
const COLOR_BG_ALT := Color8(11, 18, 33)
const COLOR_SURFACE := Color8(16, 24, 41)
const COLOR_SURFACE_ALT := Color8(22, 31, 52)
const COLOR_PANEL := Color8(9, 14, 25)
const COLOR_GRID := Color8(38, 52, 84)
const COLOR_GRID_SOFT := Color8(26, 37, 63, 160)
const COLOR_TEXT := Color8(237, 242, 252)
const COLOR_MUTED := Color8(151, 163, 188)
const COLOR_GOLD := Color8(241, 199, 92)
const COLOR_CYAN := Color8(95, 226, 235)
const COLOR_RED := Color8(243, 105, 116)
const COLOR_GREEN := Color8(117, 219, 156)
const COLOR_ORANGE := Color8(255, 170, 84)
const COLOR_WHITE_SOFT := Color8(255, 255, 255, 28)
const TITLE_SMALL_SIZE := 16
const TITLE_LARGE_SIZE := 50
const BODY_SMALL_SIZE := 17
const BODY_TINY_SIZE := 13
const HUD_LABEL_SIZE := 14
const BRIDGE_HISTORY_LIMIT := 16

const PIECE_TYPES := ["I", "O", "T", "S", "Z", "J", "L"]
const PIECE_COLORS := {
	"I": Color8(74, 227, 227),
	"O": Color8(241, 214, 83),
	"T": Color8(182, 114, 255),
	"S": Color8(91, 214, 135),
	"Z": Color8(243, 102, 112),
	"J": Color8(92, 144, 255),
	"L": Color8(255, 167, 79),
	"G": Color8(70, 76, 102)
}
const PIECES := {
	"I": [
		[Vector2i(-1, 0), Vector2i(0, 0), Vector2i(1, 0), Vector2i(2, 0)],
		[Vector2i(1, -1), Vector2i(1, 0), Vector2i(1, 1), Vector2i(1, 2)],
		[Vector2i(-1, 1), Vector2i(0, 1), Vector2i(1, 1), Vector2i(2, 1)],
		[Vector2i(0, -1), Vector2i(0, 0), Vector2i(0, 1), Vector2i(0, 2)]
	],
	"O": [
		[Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)],
		[Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)],
		[Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)],
		[Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]
	],
	"T": [
		[Vector2i(-1, 0), Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1)],
		[Vector2i(0, -1), Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1)],
		[Vector2i(0, -1), Vector2i(-1, 0), Vector2i(0, 0), Vector2i(1, 0)],
		[Vector2i(0, -1), Vector2i(-1, 0), Vector2i(0, 0), Vector2i(0, 1)]
	],
	"S": [
		[Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 1), Vector2i(0, 1)],
		[Vector2i(0, -1), Vector2i(0, 0), Vector2i(1, 0), Vector2i(1, 1)],
		[Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 1), Vector2i(0, 1)],
		[Vector2i(0, -1), Vector2i(0, 0), Vector2i(1, 0), Vector2i(1, 1)]
	],
	"Z": [
		[Vector2i(-1, 0), Vector2i(0, 0), Vector2i(0, 1), Vector2i(1, 1)],
		[Vector2i(1, -1), Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1)],
		[Vector2i(-1, 0), Vector2i(0, 0), Vector2i(0, 1), Vector2i(1, 1)],
		[Vector2i(1, -1), Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1)]
	],
	"J": [
		[Vector2i(-1, 0), Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 1)],
		[Vector2i(0, -1), Vector2i(0, 0), Vector2i(0, 1), Vector2i(1, 1)],
		[Vector2i(1, -1), Vector2i(-1, 0), Vector2i(0, 0), Vector2i(1, 0)],
		[Vector2i(-1, -1), Vector2i(0, -1), Vector2i(0, 0), Vector2i(0, 1)]
	],
	"L": [
		[Vector2i(-1, 0), Vector2i(0, 0), Vector2i(1, 0), Vector2i(1, 1)],
		[Vector2i(0, -1), Vector2i(0, 0), Vector2i(0, 1), Vector2i(1, -1)],
		[Vector2i(-1, -1), Vector2i(-1, 0), Vector2i(0, 0), Vector2i(1, 0)],
		[Vector2i(-1, 1), Vector2i(0, -1), Vector2i(0, 0), Vector2i(0, 1)]
	]
}
const SCORE_TABLE := {
	1: 100,
	2: 300,
	3: 500,
	4: 800
}

var board: Array = []
var bag: Array[String] = []
var queue: Array[String] = []
var current_piece := ""
var current_rotation := 0
var current_origin := Vector2i(4, 0)
var hold_piece := ""
var hold_used := false
var rng := RandomNumberGenerator.new()
var score := 0
var lines_cleared := 0
var level := 1
var fall_timer := 0.0
var paused := false
var game_over := false
var lock_flash := 0.0
var probe_state_path := ""
var probe_screenshot_path := ""
var probe_quit_after_frames := 0
var probe_frame_counter := 0
var probe_capture_requested := false
var bridge_dir := ""
var bridge_state_path := ""
var bridge_commands_dir := ""
var bridge_capture_path := ""
var bridge_enabled := false
var bridge_frame_counter := 0
var bridge_last_command_id := ""
var bridge_last_command_name := ""
var bridge_last_command_status := "idle"
var bridge_last_error := ""
var bridge_last_capture_path := ""
var bridge_command_history: Array = []
var title_font: Font
var body_font: Font
var session_started_msec := 0
var pieces_locked := 0


func _ready() -> void:
	rng.randomize()
	_build_empty_board()
	_parse_probe_args()
	_load_fonts()
	start_new_game()
	_bridge_write_state(true)
	queue_redraw()


func _load_fonts() -> void:
	var loaded_title: Variant = load("res://assets/fonts/Rajdhani-SemiBold.ttf")
	if loaded_title is Font:
		title_font = loaded_title as Font
	var loaded_body: Variant = load("res://assets/fonts/IBMPlexSansJP-Medium.ttf")
	if loaded_body is Font:
		body_font = loaded_body as Font


func _process(delta: float) -> void:
	bridge_frame_counter += 1
	_bridge_process_commands()

	if not paused and not game_over:
		lock_flash = maxf(0.0, lock_flash - delta)
		fall_timer += delta
		while fall_timer >= _current_drop_interval():
			fall_timer -= _current_drop_interval()
			_soft_drop_internal()
			if game_over:
				break

	if _probe_should_capture():
		_request_probe_capture()

	_bridge_write_state()
	queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_ESCAPE:
				paused = not paused
			KEY_R:
				start_new_game()
			KEY_LEFT, KEY_A:
				if not paused and not game_over:
					_move_current(Vector2i(-1, 0))
			KEY_RIGHT, KEY_D:
				if not paused and not game_over:
					_move_current(Vector2i(1, 0))
			KEY_DOWN, KEY_S:
				if not paused and not game_over:
					_soft_drop_internal()
			KEY_UP, KEY_X:
				if not paused and not game_over:
					_rotate_current(1)
			KEY_Z:
				if not paused and not game_over:
					_rotate_current(-1)
			KEY_SPACE:
				if not paused and not game_over:
					_hard_drop_internal()
			KEY_C, KEY_SHIFT:
				if not paused and not game_over:
					_hold_current()


func start_new_game() -> void:
	_build_empty_board()
	bag.clear()
	queue.clear()
	current_piece = ""
	current_rotation = 0
	current_origin = Vector2i(4, 0)
	hold_piece = ""
	hold_used = false
	score = 0
	lines_cleared = 0
	level = 1
	fall_timer = 0.0
	lock_flash = 0.0
	paused = false
	game_over = false
	session_started_msec = Time.get_ticks_msec()
	pieces_locked = 0
	_fill_queue()
	_spawn_next_piece()


func _draw() -> void:
	_draw_background()
	_draw_board_frame()
	_draw_board_cells()
	_draw_ghost_piece()
	_draw_current_piece()
	_draw_side_panel()
	if paused:
		_draw_overlay("Paused")
	elif game_over:
		_draw_overlay("Game Over")


func _draw_background() -> void:
	var viewport := get_viewport_rect()
	var stage_rect := Rect2(Vector2(24, 24), viewport.size - Vector2(48, 48))
	var accent := _current_accent_color()
	draw_rect(viewport, Color8(4, 7, 16), true)
	draw_rect(stage_rect, COLOR_BG_ALT, true)
	draw_rect(stage_rect, Color8(32, 44, 71), false, 2.0)
	draw_rect(Rect2(stage_rect.position, Vector2(stage_rect.size.x, 4.0)), COLOR_GOLD, true)
	draw_rect(Rect2(stage_rect.position + Vector2(0, stage_rect.size.y - 4.0), Vector2(stage_rect.size.x, 4.0)), Color8(31, 51, 84), true)
	for x in range(int(stage_rect.position.x), int(stage_rect.end.x), 32):
		var major := (x - int(stage_rect.position.x)) % 128 == 0
		draw_line(
			Vector2(x, stage_rect.position.y),
			Vector2(x, stage_rect.end.y),
			COLOR_GRID if major else Color(COLOR_GRID.r, COLOR_GRID.g, COLOR_GRID.b, 0.18),
			1.0
		)
	for y in range(int(stage_rect.position.y), int(stage_rect.end.y), 32):
		var major_line := (y - int(stage_rect.position.y)) % 128 == 0
		draw_line(
			Vector2(stage_rect.position.x, y),
			Vector2(stage_rect.end.x, y),
			COLOR_GRID if major_line else Color(COLOR_GRID.r, COLOR_GRID.g, COLOR_GRID.b, 0.14),
			1.0
		)
	draw_colored_polygon(
		PackedVector2Array([
			Vector2(stage_rect.position.x + 366, stage_rect.position.y),
			Vector2(stage_rect.end.x, stage_rect.position.y),
			Vector2(stage_rect.end.x, stage_rect.position.y + 276),
			Vector2(stage_rect.position.x + 694, stage_rect.position.y + 158)
		]),
		Color8(15, 28, 54, 208)
	)
	draw_colored_polygon(
		PackedVector2Array([
			Vector2(stage_rect.position.x, stage_rect.end.y - 154),
			Vector2(stage_rect.position.x + 248, stage_rect.end.y),
			Vector2(stage_rect.position.x, stage_rect.end.y)
		]),
		Color8(15, 40, 66, 126)
	)
	draw_colored_polygon(
		PackedVector2Array([
			Vector2(SIDE_PANEL_X - 24.0, stage_rect.position.y + 126.0),
			Vector2(stage_rect.end.x, stage_rect.position.y + 202.0),
			Vector2(stage_rect.end.x, stage_rect.position.y + 312.0),
			Vector2(SIDE_PANEL_X + 112.0, stage_rect.position.y + 236.0)
		]),
		Color(accent.r, accent.g, accent.b, 0.085)
	)
	draw_rect(Rect2(Vector2(SIDE_PANEL_X - 18.0, stage_rect.position.y + 44.0), Vector2(stage_rect.end.x - SIDE_PANEL_X - 22.0, 2.0)), Color(accent.r, accent.g, accent.b, 0.32), true)
	draw_rect(Rect2(Vector2(stage_rect.position.x + 18.0, stage_rect.end.y - 112.0), Vector2(248.0, 2.0)), Color(COLOR_GOLD.r, COLOR_GOLD.g, COLOR_GOLD.b, 0.22), true)
	_draw_ambient_piece(stage_rect.position + Vector2(stage_rect.size.x - 166.0, 126.0), "T", 20.0, Color(accent.r, accent.g, accent.b, 0.08), 0)
	_draw_ambient_piece(stage_rect.position + Vector2(56.0, stage_rect.size.y - 148.0), "L", 16.0, Color(COLOR_GOLD.r, COLOR_GOLD.g, COLOR_GOLD.b, 0.06), 0)
	draw_arc(stage_rect.position + Vector2(stage_rect.size.x - 142.0, 114.0), 96.0, PI * 0.18, PI * 1.14, 40, Color(accent.r, accent.g, accent.b, 0.42), 2.0)
	draw_arc(stage_rect.position + Vector2(stage_rect.size.x - 142.0, 114.0), 68.0, PI * 0.24, PI * 1.08, 32, Color(COLOR_GOLD.r, COLOR_GOLD.g, COLOR_GOLD.b, 0.28), 2.0)


func _draw_board_frame() -> void:
	var size := Vector2(BOARD_WIDTH * CELL_SIZE, BOARD_HEIGHT * CELL_SIZE)
	var board_shell := Rect2(BOARD_OFFSET - Vector2(30, 40), size + Vector2(60, 60))
	var board_rect := Rect2(BOARD_OFFSET, size)
	var heading_font := title_font if title_font != null else ThemeDB.fallback_font
	var copy_font := body_font if body_font != null else ThemeDB.fallback_font
	var accent := _current_accent_color()
	var danger_ratio := _get_danger_ratio()
	draw_rect(board_shell, COLOR_SURFACE, true)
	draw_rect(board_shell, Color8(44, 58, 92), false, 2.0)
	draw_rect(board_shell.grow(-12.0), Color8(24, 33, 54), false, 1.0)
	draw_rect(Rect2(board_shell.position, Vector2(board_shell.size.x, 4.0)), COLOR_GOLD, true)
	draw_rect(Rect2(board_shell.position + Vector2(0, 44.0), Vector2(board_shell.size.x, 3.0)), accent, true)
	draw_rect(board_rect, COLOR_PANEL, true)
	draw_rect(board_rect, Color8(52, 68, 108), false, 2.0)
	draw_rect(board_rect.grow(4.0), Color(accent.r, accent.g, accent.b, 0.28), false, 2.0)
	if danger_ratio > 0.0:
		var alert_height := CELL_SIZE * 4.0
		var alert_alpha := 0.04 + danger_ratio * 0.1
		draw_rect(Rect2(board_rect.position, Vector2(board_rect.size.x, alert_height)), Color(COLOR_RED.r, COLOR_RED.g, COLOR_RED.b, alert_alpha), true)
		draw_rect(Rect2(board_rect.position + Vector2(0, alert_height), Vector2(board_rect.size.x, 2.0)), Color(COLOR_RED.r, COLOR_RED.g, COLOR_RED.b, 0.22 + danger_ratio * 0.28), true)
	if heading_font != null:
		draw_string(copy_font, board_shell.position + Vector2(18, 18), "PLAYFIELD", HORIZONTAL_ALIGNMENT_LEFT, -1, HUD_LABEL_SIZE, COLOR_GOLD)
		draw_string(heading_font, board_shell.position + Vector2(18, 40), "STACK CONTROL", HORIZONTAL_ALIGNMENT_LEFT, -1, 26, COLOR_TEXT)
		draw_string(copy_font, board_shell.position + Vector2(board_shell.size.x - 92.0, 18), "ACTIVE", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, Color(accent.r, accent.g, accent.b, 0.92))
		draw_string(heading_font, board_shell.position + Vector2(board_shell.size.x - 62.0, 42), current_piece if current_piece != "" else "--", HORIZONTAL_ALIGNMENT_LEFT, -1, 24, accent)
	for marker in range(5, BOARD_HEIGHT, 5):
		var marker_y := BOARD_OFFSET.y + marker * CELL_SIZE + 16.0
		if copy_font != null:
			draw_string(copy_font, Vector2(board_shell.position.x + 8.0, marker_y), "%02d" % marker, HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
	for y in BOARD_HEIGHT + 1:
		var line_y := BOARD_OFFSET.y + y * CELL_SIZE
		var is_major := y % 5 == 0
		draw_line(
			Vector2(BOARD_OFFSET.x, line_y),
			Vector2(BOARD_OFFSET.x + size.x, line_y),
			Color8(48, 67, 104, 190) if is_major else Color8(28, 38, 60, 160)
		)
	for x in BOARD_WIDTH + 1:
		var line_x := BOARD_OFFSET.x + x * CELL_SIZE
		var is_column_major := x % 5 == 0
		draw_line(
			Vector2(line_x, BOARD_OFFSET.y),
			Vector2(line_x, BOARD_OFFSET.y + size.y),
			Color8(48, 67, 104, 190) if is_column_major else Color8(28, 38, 60, 160)
		)
	if lock_flash > 0.0:
		var glow_alpha := minf(0.22, lock_flash * 1.8)
		draw_rect(board_rect.grow(5.0), Color(accent.r, accent.g, accent.b, glow_alpha), false, 3.0)
		draw_rect(board_rect.grow(10.0), Color(COLOR_GOLD.r, COLOR_GOLD.g, COLOR_GOLD.b, glow_alpha * 0.65), false, 2.0)
	if copy_font != null:
		_draw_pressure_rail(board_shell, copy_font, accent)


func _draw_board_cells() -> void:
	for y in BOARD_HEIGHT:
		for x in BOARD_WIDTH:
			var id: String = board[y][x]
			if id == "":
				continue
			_draw_cell(Vector2i(x, y), PIECE_COLORS.get(id, Color.WHITE))


func _draw_current_piece() -> void:
	if current_piece == "":
		return
	for block in _current_cells():
		if block.y >= 0:
			_draw_cell(block, PIECE_COLORS[current_piece], 1.0)


func _draw_ghost_piece() -> void:
	if current_piece == "":
		return
	var ghost_origin := _ghost_origin()
	for offset in PIECES[current_piece][current_rotation]:
		var block: Vector2i = ghost_origin + offset
		if block.y >= 0:
			_draw_cell(block, PIECE_COLORS[current_piece], 0.18)


func _draw_side_panel() -> void:
	var heading_font := title_font if title_font != null else ThemeDB.fallback_font
	var copy_font := body_font if body_font != null else ThemeDB.fallback_font
	if heading_font == null or copy_font == null:
		return
	var accent := _current_accent_color()
	var stack_height := _get_stack_height()
	var headroom := BOARD_HEIGHT - stack_height
	var lines_to_level := _get_lines_to_next_level()
	var bag_progress := _get_bag_progress()
	var danger_label := _get_danger_label()
	var title_rect := Rect2(Vector2(SIDE_PANEL_X, 72), Vector2(744, 114))
	var score_rect := Rect2(Vector2(SIDE_PANEL_X, 214), Vector2(236, 314))
	var next_rect := Rect2(Vector2(SIDE_PANEL_X + 282, 214), Vector2(462, 314))
	var hold_rect := Rect2(Vector2(SIDE_PANEL_X, 560), Vector2(236, 72))
	var info_rect := Rect2(Vector2(SIDE_PANEL_X + 282, 560), Vector2(462, 72))
	var elapsed_seconds := int(max(0, Time.get_ticks_msec() - session_started_msec) / 1000.0)
	var status_text := "LIVE" if not game_over and not paused else ("PAUSED" if paused else "TOP OUT")
	var link_text := "LINK ON" if bridge_enabled else "LINK OFF"
	draw_string(copy_font, title_rect.position + Vector2(0, 8), "TTL TETRIS / LIVE FIELD UNIT", HORIZONTAL_ALIGNMENT_LEFT, -1, TITLE_SMALL_SIZE, COLOR_GOLD)
	draw_string(heading_font, title_rect.position + Vector2(0, 58), "TTL TETRIS", HORIZONTAL_ALIGNMENT_LEFT, -1, TITLE_LARGE_SIZE, COLOR_TEXT)
	draw_string(copy_font, title_rect.position + Vector2(0, 90), "FIELD TELEMETRY / LIVE BRIDGE", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, COLOR_MUTED)
	draw_string(copy_font, title_rect.position + Vector2(0, 112), "STACK %02d/20" % stack_height, HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
	draw_string(copy_font, title_rect.position + Vector2(126, 112), "HEADROOM %02d" % headroom, HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
	draw_string(copy_font, title_rect.position + Vector2(276, 112), "TO LV %02d" % lines_to_level, HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
	draw_string(copy_font, title_rect.position + Vector2(394, 112), "LOCKS %03d" % pieces_locked, HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
	draw_line(title_rect.position + Vector2(542, 10), title_rect.position + Vector2(542, 108), Color8(48, 64, 100), 1.0)
	draw_string(copy_font, title_rect.position + Vector2(578, 18), status_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, accent if status_text == "LIVE" else COLOR_GOLD)
	draw_string(copy_font, title_rect.position + Vector2(578, 42), link_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, COLOR_GREEN if bridge_enabled else COLOR_MUTED)
	draw_string(copy_font, title_rect.position + Vector2(578, 66), "STACK %s" % danger_label, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, COLOR_RED if danger_label == "CRITICAL" else COLOR_MUTED)
	draw_string(copy_font, title_rect.position + Vector2(578, 90), "BAG %d/7" % bag_progress, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, COLOR_MUTED)
	draw_arc(title_rect.position + Vector2(682, 50), 46.0, PI * 0.22, PI * 1.08, 24, Color(accent.r, accent.g, accent.b, 0.44), 2.0)
	draw_arc(title_rect.position + Vector2(682, 50), 30.0, PI * 0.24, PI * 1.02, 18, Color(COLOR_GOLD.r, COLOR_GOLD.g, COLOR_GOLD.b, 0.24), 2.0)
	_draw_score_tower(score_rect, heading_font, copy_font, accent, danger_label)
	_draw_queue_rack(next_rect, copy_font, accent, bag_progress)
	_draw_hold_dock(hold_rect, copy_font, accent)
	_draw_footer_strip(info_rect, copy_font, accent, elapsed_seconds, stack_height, lines_to_level)


func _draw_overlay(text: String) -> void:
	var heading_font := title_font if title_font != null else ThemeDB.fallback_font
	var copy_font := body_font if body_font != null else ThemeDB.fallback_font
	if heading_font == null or copy_font == null:
		return
	var rect := Rect2(Vector2(82, 252), Vector2(336, 138))
	var accent := _current_accent_color()
	draw_rect(rect, Color(0.04, 0.06, 0.09, 0.92), true)
	draw_rect(rect, accent if paused else COLOR_GOLD, false, 2.0)
	draw_rect(Rect2(rect.position, Vector2(rect.size.x, 5.0)), accent if paused else COLOR_GOLD, true)
	draw_string(copy_font, rect.position + Vector2(24, 24), "SESSION INTERRUPT", HORIZONTAL_ALIGNMENT_LEFT, -1, HUD_LABEL_SIZE, COLOR_GOLD)
	draw_string(heading_font, rect.position + Vector2(24, 78), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 34, COLOR_TEXT)
	draw_string(copy_font, rect.position + Vector2(24, 112), "R to restart / Esc to resume / keep the field moving", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_SMALL_SIZE, COLOR_MUTED)


func _draw_score_tower(rect: Rect2, heading_font: Font, copy_font: Font, accent: Color, danger_label: String) -> void:
	var tower_fill := Color8(15, 21, 36)
	draw_rect(rect, tower_fill, true)
	draw_rect(rect, Color8(44, 60, 97), false, 2.0)
	draw_rect(Rect2(rect.position, Vector2(12.0, rect.size.y)), COLOR_GOLD, true)
	draw_rect(Rect2(rect.position + Vector2(12.0, 0), Vector2(rect.size.x - 12.0, 2.0)), Color8(86, 112, 168), true)
	draw_colored_polygon(
		PackedVector2Array([
			rect.position + Vector2(rect.size.x - 52.0, 0.0),
			rect.position + Vector2(rect.size.x, 0.0),
			rect.position + Vector2(rect.size.x, 52.0)
		]),
		Color(accent.r, accent.g, accent.b, 0.12)
	)
	draw_string(copy_font, rect.position + Vector2(22, 22), "SCORE LADDER", HORIZONTAL_ALIGNMENT_LEFT, -1, HUD_LABEL_SIZE, COLOR_GOLD)
	draw_string(heading_font, rect.position + Vector2(20, 84), "%06d" % score, HORIZONTAL_ALIGNMENT_LEFT, -1, 50, COLOR_TEXT)
	draw_line(rect.position + Vector2(20, 108), rect.position + Vector2(rect.size.x - 18, 108), Color8(63, 83, 127), 2.0)
	draw_string(copy_font, rect.position + Vector2(22, 134), "LINES", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
	draw_string(copy_font, rect.position + Vector2(106, 134), "LEVEL", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
	draw_string(copy_font, rect.position + Vector2(188, 134), "DROP", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
	draw_string(heading_font, rect.position + Vector2(22, 164), str(lines_cleared), HORIZONTAL_ALIGNMENT_LEFT, -1, 24, COLOR_TEXT)
	draw_string(heading_font, rect.position + Vector2(106, 164), str(level), HORIZONTAL_ALIGNMENT_LEFT, -1, 24, COLOR_TEXT)
	draw_string(copy_font, rect.position + Vector2(188, 162), "%.2fs" % _current_drop_interval(), HORIZONTAL_ALIGNMENT_LEFT, -1, 19, accent)
	draw_line(rect.position + Vector2(20, 190), rect.position + Vector2(rect.size.x - 18, 190), Color8(37, 50, 79), 1.0)
	_draw_metric_tape(copy_font, rect.position + Vector2(20, 212), rect.size.x - 38.0, "PRESSURE", danger_label, COLOR_RED if danger_label == "CRITICAL" else accent)
	_draw_metric_tape(copy_font, rect.position + Vector2(20, 244), rect.size.x - 38.0, "HEADROOM", "%02d CELLS" % (BOARD_HEIGHT - _get_stack_height()), COLOR_CYAN)
	_draw_metric_tape(copy_font, rect.position + Vector2(20, 276), rect.size.x - 38.0, "LOCK COUNT", "%03d PIECES" % pieces_locked, COLOR_ORANGE)


func _draw_queue_rack(rect: Rect2, copy_font: Font, accent: Color, bag_progress: int) -> void:
	draw_line(rect.position, rect.position + Vector2(rect.size.x, 0), COLOR_ORANGE, 3.0)
	draw_line(rect.position + Vector2(0, 6.0), rect.position + Vector2(0, rect.size.y), Color8(54, 72, 112), 2.0)
	draw_line(rect.position + Vector2(rect.size.x, 6.0), rect.position + Vector2(rect.size.x, rect.size.y), Color8(54, 72, 112), 1.0)
	draw_string(copy_font, rect.position + Vector2(18, 18), "NEXT STACK", HORIZONTAL_ALIGNMENT_LEFT, -1, HUD_LABEL_SIZE, COLOR_ORANGE)
	draw_string(copy_font, rect.position + Vector2(rect.size.x - 90.0, 18), "BAG %d/7" % bag_progress, HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
	for index in min(queue.size(), 5):
		var row_top := rect.position.y + 48.0 + float(index) * 52.0
		var row_rect := Rect2(Vector2(rect.position.x + 18.0, row_top), Vector2(rect.size.x - 36.0, 40.0))
		draw_rect(row_rect, Color8(14, 21, 35, 150), true)
		draw_line(row_rect.position + Vector2(0, row_rect.size.y), row_rect.position + Vector2(row_rect.size.x, row_rect.size.y), Color8(45, 61, 96), 1.0)
		draw_string(copy_font, row_rect.position + Vector2(10, 15), "%02d" % (index + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
		draw_string(copy_font, row_rect.position + Vector2(46, 15), queue[index], HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_SMALL_SIZE, PIECE_COLORS[queue[index]])
		_draw_piece_preview(Rect2(row_rect.position + Vector2(row_rect.size.x - 144.0, 2.0), Vector2(126.0, 36.0)), queue[index], 0.66)
		if index == 0:
			draw_string(copy_font, row_rect.position + Vector2(76, 15), "ON DECK", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, Color(accent.r, accent.g, accent.b, 0.9))


func _draw_hold_dock(rect: Rect2, copy_font: Font, accent: Color) -> void:
	draw_line(rect.position, rect.position + Vector2(rect.size.x, 0), accent, 3.0)
	draw_line(rect.position + Vector2(0, rect.size.y), rect.position + Vector2(rect.size.x, rect.size.y), Color(accent.r, accent.g, accent.b, 0.36), 2.0)
	draw_rect(Rect2(rect.position + Vector2(0, 6.0), Vector2(rect.size.x, rect.size.y - 12.0)), Color8(16, 24, 39, 170), true)
	draw_string(copy_font, rect.position + Vector2(0, 18), "HOLD BAY", HORIZONTAL_ALIGNMENT_LEFT, -1, HUD_LABEL_SIZE, COLOR_CYAN)
	draw_string(copy_font, rect.position + Vector2(0, 42), "STATE %s" % ("LOCKED" if hold_used else "READY"), HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
	draw_string(copy_font, rect.position + Vector2(0, 64), hold_piece if hold_piece != "" else "EMPTY", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_SMALL_SIZE, COLOR_TEXT)
	_draw_piece_preview(Rect2(rect.position + Vector2(108.0, 8.0), Vector2(122.0, rect.size.y - 16.0)), hold_piece, 0.92)


func _draw_footer_strip(rect: Rect2, copy_font: Font, accent: Color, elapsed_seconds: int, stack_height: int, lines_to_level: int) -> void:
	draw_line(rect.position, rect.position + Vector2(rect.size.x, 0), accent, 3.0)
	draw_line(rect.position + Vector2(0, rect.size.y), rect.position + Vector2(rect.size.x, rect.size.y), Color(accent.r, accent.g, accent.b, 0.36), 2.0)
	draw_line(rect.position + Vector2(0, 34.0), rect.position + Vector2(rect.size.x, 34.0), Color8(45, 62, 97), 1.0)
	draw_line(rect.position + Vector2(88.0, 0.0), rect.position + Vector2(88.0, rect.size.y), Color8(36, 52, 81), 1.0)
	draw_line(rect.position + Vector2(184.0, 0.0), rect.position + Vector2(184.0, rect.size.y), Color8(36, 52, 81), 1.0)
	draw_line(rect.position + Vector2(278.0, 0.0), rect.position + Vector2(278.0, rect.size.y), Color8(36, 52, 81), 1.0)
	draw_line(rect.position + Vector2(370.0, 0.0), rect.position + Vector2(370.0, rect.size.y), Color8(36, 52, 81), 1.0)
	draw_string(copy_font, rect.position + Vector2(0, 16), "CONTROL", HORIZONTAL_ALIGNMENT_LEFT, -1, HUD_LABEL_SIZE, COLOR_TEXT)
	draw_string(copy_font, rect.position + Vector2(98, 16), "RUN %02d:%02d" % [int(floor(float(elapsed_seconds) / 60.0)), elapsed_seconds % 60], HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_SMALL_SIZE, COLOR_MUTED)
	draw_string(copy_font, rect.position + Vector2(194, 16), "PIECE %s" % current_piece, HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_SMALL_SIZE, accent)
	draw_string(copy_font, rect.position + Vector2(288, 16), "STK %02d/20" % stack_height, HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_SMALL_SIZE, COLOR_MUTED)
	draw_string(copy_font, rect.position + Vector2(380, 16), "LINK %s" % ("ON" if bridge_enabled else "OFF"), HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_SMALL_SIZE, COLOR_GREEN if bridge_enabled else COLOR_MUTED)
	draw_string(copy_font, rect.position + Vector2(0, 58), "LV %02d > %02d" % [level, lines_to_level], HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
	draw_string(copy_font, rect.position + Vector2(72, 58), "A LEFT", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_TEXT)
	draw_string(copy_font, rect.position + Vector2(136, 58), "D RIGHT", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_TEXT)
	draw_string(copy_font, rect.position + Vector2(214, 58), "S SOFT", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_TEXT)
	draw_string(copy_font, rect.position + Vector2(278, 58), "SPACE HARD", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_TEXT)
	draw_string(copy_font, rect.position + Vector2(376, 58), "Z/X TURN", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_TEXT)
	draw_string(copy_font, rect.position + Vector2(448, 58), "C HOLD", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_TEXT)


func _draw_metric_tape(font: Font, origin: Vector2, width: float, label: String, value: String, color: Color) -> void:
	draw_line(origin, origin + Vector2(width, 0), Color(color.r, color.g, color.b, 0.38), 1.0)
	draw_string(font, origin + Vector2(0, -2.0), label, HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)
	draw_string(font, origin + Vector2(width - 112.0, -2.0), value, HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_SMALL_SIZE, color)


func _draw_cell(cell: Vector2i, color: Color, alpha := 1.0) -> void:
	var pos := BOARD_OFFSET + Vector2(cell.x * CELL_SIZE, cell.y * CELL_SIZE)
	var base_rect := Rect2(pos + Vector2.ONE, Vector2(CELL_SIZE - 2.0, CELL_SIZE - 2.0))
	var shade := Color(color.r, color.g, color.b, alpha)
	var top_highlight := color.lightened(0.22)
	top_highlight.a = alpha
	var low_shadow := color.darkened(0.25)
	low_shadow.a = alpha
	draw_rect(base_rect, shade, true)
	draw_rect(Rect2(base_rect.position, Vector2(base_rect.size.x, 6.0)), top_highlight, true)
	draw_rect(Rect2(base_rect.position + Vector2(0, base_rect.size.y - 5.0), Vector2(base_rect.size.x, 5.0)), low_shadow, true)
	draw_rect(Rect2(base_rect.position + Vector2(2, 2), Vector2(base_rect.size.x - 10.0, base_rect.size.y - 12.0)), Color(1.0, 1.0, 1.0, 0.08 * alpha), true)
	draw_rect(Rect2(base_rect.position + Vector2(4, 4), Vector2(base_rect.size.x - 18.0, 6.0)), Color(1.0, 1.0, 1.0, 0.18 * alpha), true)
	draw_rect(Rect2(base_rect.position + Vector2(base_rect.size.x - 8.0, 4.0), Vector2(4.0, base_rect.size.y - 12.0)), Color(color.r, color.g, color.b, 0.26 * alpha), true)
	draw_rect(base_rect, Color(1, 1, 1, 0.12 * alpha), false, 1.0)


func _draw_module_box(rect: Rect2, fill_color: Color, accent_color: Color) -> void:
	draw_rect(rect, fill_color, true)
	draw_rect(rect, Color8(49, 65, 102), false, 2.0)
	draw_rect(Rect2(rect.position, Vector2(rect.size.x, 5.0)), accent_color, true)
	draw_rect(Rect2(rect.position + Vector2(0, rect.size.y - 3.0), Vector2(rect.size.x, 3.0)), Color(accent_color.r, accent_color.g, accent_color.b, 0.3), true)
	draw_rect(Rect2(rect.position + Vector2(rect.size.x - 26.0, 0), Vector2(26.0, 5.0)), COLOR_TEXT, true)
	draw_line(rect.position + Vector2(rect.size.x - 38.0, 0), rect.position + Vector2(rect.size.x, 38.0), Color(accent_color.r, accent_color.g, accent_color.b, 0.18), 2.0)


func _draw_piece_preview(rect: Rect2, piece_id: String, preview_scale := 1.0) -> void:
	if piece_id == "":
		return
	var cells: Array = PIECES[piece_id][0]
	var min_x := 999
	var min_y := 999
	var max_x := -999
	var max_y := -999
	for cell in cells:
		min_x = mini(min_x, cell.x)
		min_y = mini(min_y, cell.y)
		max_x = maxi(max_x, cell.x)
		max_y = maxi(max_y, cell.y)
	var preview_cell_size := 18.0 * preview_scale
	var content_width := float(max_x - min_x + 1) * preview_cell_size
	var content_height := float(max_y - min_y + 1) * preview_cell_size
	var start := rect.position + Vector2((rect.size.x - content_width) * 0.5, (rect.size.y - content_height) * 0.5)
	var color: Color = PIECE_COLORS[piece_id]
	for cell in cells:
		var draw_pos := start + Vector2(float(cell.x - min_x) * preview_cell_size, float(cell.y - min_y) * preview_cell_size)
		var block_rect := Rect2(draw_pos, Vector2(preview_cell_size - 3.0, preview_cell_size - 3.0))
		draw_rect(block_rect, color, true)
		draw_rect(Rect2(block_rect.position, Vector2(block_rect.size.x, 3.0)), color.lightened(0.18), true)
		draw_rect(Rect2(block_rect.position + Vector2(0, block_rect.size.y - 3.0), Vector2(block_rect.size.x, 3.0)), color.darkened(0.18), true)
		draw_rect(Rect2(block_rect.position + Vector2(2, 2), Vector2(block_rect.size.x - 8.0, 4.0)), Color(1, 1, 1, 0.16), true)
		draw_rect(block_rect, Color(1, 1, 1, 0.1), false, 1.0)


func _draw_ambient_piece(origin: Vector2, piece_id: String, preview_cell_size: float, color: Color, piece_rotation := 0) -> void:
	if not PIECES.has(piece_id):
		return
	for cell in PIECES[piece_id][piece_rotation]:
		var draw_pos := origin + Vector2(cell.x * preview_cell_size, cell.y * preview_cell_size)
		draw_rect(Rect2(draw_pos, Vector2(preview_cell_size - 2.0, preview_cell_size - 2.0)), color, true)


func _current_accent_color() -> Color:
	if PIECE_COLORS.has(current_piece):
		return PIECE_COLORS[current_piece]
	return COLOR_CYAN


func _draw_keycap(font: Font, origin: Vector2, key_text: String, description: String, key_width := 40.0) -> void:
	var key_rect := Rect2(origin, Vector2(key_width, 26))
	draw_rect(key_rect, Color8(18, 25, 42), true)
	draw_rect(key_rect, Color8(66, 88, 132), false, 1.0)
	draw_string(font, key_rect.position + Vector2(8, 18), key_text, HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_TEXT)
	draw_string(font, origin + Vector2(key_width + 10, 18), description, HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_SMALL_SIZE, COLOR_MUTED)


func _draw_pressure_rail(board_shell: Rect2, font: Font, accent: Color) -> void:
	var rail_rect := Rect2(board_shell.position + Vector2(board_shell.size.x - 14.0, 56.0), Vector2(6.0, board_shell.size.y - 96.0))
	var danger_ratio := _get_danger_ratio()
	var fill_height := rail_rect.size.y * danger_ratio
	var fill_color := COLOR_GREEN.lerp(COLOR_RED, clampf(danger_ratio * 1.15, 0.0, 1.0))
	draw_rect(rail_rect, Color8(10, 16, 27), true)
	draw_rect(rail_rect, Color8(51, 67, 102), false, 1.0)
	for tick in range(1, 5):
		var tick_y := rail_rect.position.y + rail_rect.size.y * (float(tick) / 5.0)
		draw_line(Vector2(rail_rect.position.x - 4.0, tick_y), Vector2(rail_rect.position.x + rail_rect.size.x + 4.0, tick_y), Color8(41, 55, 85, 180), 1.0)
	if fill_height > 0.0:
		draw_rect(Rect2(rail_rect.position + Vector2(0, rail_rect.size.y - fill_height), Vector2(rail_rect.size.x, fill_height)), fill_color, true)
	draw_string(font, rail_rect.position + Vector2(-38.0, 10.0), "RISK", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_RED if danger_ratio >= 0.72 else accent)
	draw_string(font, rail_rect.position + Vector2(-44.0, rail_rect.size.y + 14.0), "SAFE", HORIZONTAL_ALIGNMENT_LEFT, -1, BODY_TINY_SIZE, COLOR_MUTED)


func _count_locked_cells(row: Array) -> int:
	var total := 0
	for cell in row:
		if String(cell) != "":
			total += 1
	return total


func _get_stack_height() -> int:
	for y in BOARD_HEIGHT:
		for x in BOARD_WIDTH:
			if board[y][x] != "":
				return BOARD_HEIGHT - y
	return 0


func _get_danger_ratio() -> float:
	return clampf(float(_get_stack_height()) / float(BOARD_HEIGHT), 0.0, 1.0)


func _get_danger_label() -> String:
	var ratio := _get_danger_ratio()
	if ratio >= 0.8:
		return "CRITICAL"
	if ratio >= 0.6:
		return "HIGH"
	if ratio >= 0.35:
		return "RISING"
	return "SAFE"


func _get_lines_to_next_level() -> int:
	var remainder := lines_cleared % 10
	return 10 if remainder == 0 else 10 - remainder


func _get_bag_progress() -> int:
	return clampi(7 - bag.size(), 0, 7)


func _build_empty_board() -> void:
	board.clear()
	for _row in BOARD_HEIGHT:
		var row: Array[String] = []
		for _col in BOARD_WIDTH:
			row.append("")
		board.append(row)


func _fill_queue() -> void:
	while queue.size() < 5:
		if bag.is_empty():
			bag.clear()
			for piece_id in PIECE_TYPES:
				bag.append(piece_id)
			bag.shuffle()
		queue.append(bag.pop_back())


func _spawn_next_piece() -> void:
	_fill_queue()
	current_piece = queue.pop_front()
	current_rotation = 0
	current_origin = Vector2i(4, 0)
	hold_used = false
	if not _is_valid_position(current_piece, current_rotation, current_origin):
		game_over = true
		current_origin = Vector2i(4, 1)
	_fill_queue()


func _current_drop_interval() -> float:
	return maxf(MIN_DROP_INTERVAL, BASE_DROP_INTERVAL - 0.055 * float(level - 1))


func _current_cells() -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	if current_piece == "":
		return cells
	for offset in PIECES[current_piece][current_rotation]:
		cells.append(current_origin + offset)
	return cells


func _is_valid_position(piece_id: String, piece_rotation: int, origin: Vector2i) -> bool:
	for offset in PIECES[piece_id][piece_rotation]:
		var cell: Vector2i = origin + offset
		if cell.x < 0 or cell.x >= BOARD_WIDTH:
			return false
		if cell.y >= BOARD_HEIGHT:
			return false
		if cell.y >= 0 and board[cell.y][cell.x] != "":
			return false
	return true


func _move_current(offset: Vector2i) -> bool:
	var target := current_origin + offset
	if _is_valid_position(current_piece, current_rotation, target):
		current_origin = target
		return true
	return false


func _rotate_current(direction: int) -> bool:
	var target_rotation := posmod(current_rotation + direction, 4)
	var kick_tests := [Vector2i.ZERO, Vector2i(1, 0), Vector2i(-1, 0), Vector2i(2, 0), Vector2i(-2, 0), Vector2i(0, -1)]
	for kick in kick_tests:
		if _is_valid_position(current_piece, target_rotation, current_origin + kick):
			current_rotation = target_rotation
			current_origin += kick
			return true
	return false


func _soft_drop_internal() -> void:
	if game_over:
		return
	if not _move_current(Vector2i(0, 1)):
		_lock_current_piece()
	else:
		score += 1


func _hard_drop_internal() -> void:
	if game_over:
		return
	var steps := 0
	while _move_current(Vector2i(0, 1)):
		steps += 1
	score += steps * 2
	_lock_current_piece()


func _hold_current() -> void:
	if hold_used or current_piece == "":
		return
	hold_used = true
	var previous_hold := hold_piece
	hold_piece = current_piece
	if previous_hold == "":
		_spawn_next_piece()
	else:
		current_piece = previous_hold
		current_rotation = 0
		current_origin = Vector2i(4, 0)
		if not _is_valid_position(current_piece, current_rotation, current_origin):
			game_over = true


func _lock_current_piece() -> void:
	for block in _current_cells():
		if block.y < 0:
			game_over = true
			return
		board[block.y][block.x] = current_piece
	pieces_locked += 1
	lock_flash = 0.12
	_clear_full_rows()
	_spawn_next_piece()


func _clear_full_rows() -> void:
	var kept_rows: Array = []
	var cleared := 0
	for row in board:
		var full := true
		for cell in row:
			if cell == "":
				full = false
				break
		if full:
			cleared += 1
		else:
			kept_rows.append(row)
	for _index in cleared:
		var new_row: Array[String] = []
		for _col in BOARD_WIDTH:
			new_row.append("")
		kept_rows.push_front(new_row)
	if cleared > 0:
		board = kept_rows
		lines_cleared += cleared
		level = 1 + int(floor(float(lines_cleared) / 10.0))
		score += SCORE_TABLE.get(cleared, 0) * level


func _ghost_origin() -> Vector2i:
	var ghost := current_origin
	while _is_valid_position(current_piece, current_rotation, ghost + Vector2i(0, 1)):
		ghost += Vector2i(0, 1)
	return ghost


func _parse_probe_args() -> void:
	var args := OS.get_cmdline_user_args()
	var index := 0
	while index < args.size():
		match args[index]:
			"--mcp-state":
				if index + 1 < args.size():
					probe_state_path = args[index + 1]
					index += 1
			"--mcp-screenshot":
				if index + 1 < args.size():
					probe_screenshot_path = args[index + 1]
					index += 1
			"--mcp-quit-after-frames":
				if index + 1 < args.size():
					probe_quit_after_frames = int(args[index + 1])
					index += 1
			"--mcp-bridge-dir":
				if index + 1 < args.size():
					bridge_dir = args[index + 1]
					index += 1
		index += 1
	if bridge_dir != "":
		bridge_enabled = true
		bridge_state_path = bridge_dir.path_join("state.json")
		bridge_commands_dir = bridge_dir.path_join("commands")
		bridge_capture_path = bridge_dir.path_join("live_capture.png")
		DirAccess.make_dir_recursive_absolute(bridge_commands_dir)


func _bridge_process_commands() -> void:
	if not bridge_enabled:
		return
	var file_names := DirAccess.get_files_at(bridge_commands_dir)
	file_names.sort()
	for file_name in file_names:
		if not file_name.ends_with(".json"):
			continue
		var command_path := bridge_commands_dir.path_join(file_name)
		var command_text := FileAccess.get_file_as_string(command_path)
		var parsed: Variant = JSON.parse_string(command_text)
		var result := {
			"status": "error",
			"error": "invalid command payload"
		}
		if typeof(parsed) == TYPE_DICTIONARY:
			result = _execute_bridge_command(parsed as Dictionary)
			bridge_last_command_id = String((parsed as Dictionary).get("id", ""))
			bridge_last_command_name = String((parsed as Dictionary).get("command", ""))
		else:
			bridge_last_command_id = file_name.get_basename()
			bridge_last_command_name = "invalid"
		bridge_last_command_status = String(result.get("status", "ok"))
		bridge_last_error = String(result.get("error", ""))
		if result.has("capture_path"):
			bridge_last_capture_path = String(result.get("capture_path", ""))
		_record_bridge_history(bridge_last_command_id, bridge_last_command_name, result)
		DirAccess.remove_absolute(command_path)


func _execute_bridge_command(command_payload: Dictionary) -> Dictionary:
	var command_name := String(command_payload.get("command", ""))
	var args_value: Variant = command_payload.get("args", {})
	var command_args: Dictionary = {}
	if typeof(args_value) == TYPE_DICTIONARY:
		command_args = args_value as Dictionary
	match command_name:
		"move_left":
			return {"status": "ok", "moved": _move_current(Vector2i(-1, 0))}
		"move_right":
			return {"status": "ok", "moved": _move_current(Vector2i(1, 0))}
		"soft_drop":
			_soft_drop_internal()
			return {"status": "ok"}
		"hard_drop":
			_hard_drop_internal()
			return {"status": "ok"}
		"rotate_cw":
			return {"status": "ok", "rotated": _rotate_current(1)}
		"rotate_ccw":
			return {"status": "ok", "rotated": _rotate_current(-1)}
		"hold":
			_hold_current()
			return {"status": "ok"}
		"toggle_pause":
			paused = not paused
			return {"status": "ok", "paused": paused}
		"restart":
			start_new_game()
			return {"status": "ok"}
		"capture_frame":
			var capture_path := String(command_args.get("path", bridge_capture_path))
			if capture_path == "":
				return {"status": "error", "error": "capture path is empty"}
			var saved := _save_capture_image(capture_path)
			if not saved:
				return {"status": "error", "error": "failed to save capture", "capture_path": capture_path}
			return {"status": "ok", "capture_path": capture_path}
		"snapshot":
			return {"status": "ok"}
		_:
			return {"status": "error", "error": "unknown command: %s" % command_name}


func _record_bridge_history(command_id: String, command_name: String, result: Dictionary) -> void:
	var snapshot := _build_bridge_state_summary()
	var entry := {
		"id": command_id,
		"command": command_name,
		"status": String(result.get("status", bridge_last_command_status)),
		"error": String(result.get("error", "")),
		"timestamp_msec": Time.get_ticks_msec(),
		"capture_path": String(result.get("capture_path", "")),
		"state": snapshot
	}
	bridge_command_history.append(entry)
	if bridge_command_history.size() > BRIDGE_HISTORY_LIMIT:
		bridge_command_history.pop_front()


func _bridge_write_state(force := false) -> void:
	if not bridge_enabled:
		return
	if not force and bridge_state_path == "":
		return
	DirAccess.make_dir_recursive_absolute(bridge_state_path.get_base_dir())
	var payload := debug_get_state()
	payload["bridge"] = {
		"enabled": bridge_enabled,
		"frame_counter": bridge_frame_counter,
		"last_command_id": bridge_last_command_id,
		"last_command_name": bridge_last_command_name,
		"last_command_status": bridge_last_command_status,
		"last_error": bridge_last_error,
		"last_capture_path": bridge_last_capture_path,
		"command_history": bridge_command_history.duplicate(true)
	}
	payload["timestamp_msec"] = Time.get_ticks_msec()
	var state_file := FileAccess.open(bridge_state_path, FileAccess.WRITE)
	if state_file:
		state_file.store_string(JSON.stringify(payload, "\t"))


func _probe_should_capture() -> bool:
	if probe_capture_requested:
		return false
	if probe_state_path == "" and probe_screenshot_path == "":
		return false
	probe_frame_counter += 1
	return probe_quit_after_frames > 0 and probe_frame_counter >= probe_quit_after_frames


func _request_probe_capture() -> void:
	if probe_capture_requested:
		return
	probe_capture_requested = true
	call_deferred("_capture_probe_and_quit")


func _capture_probe_and_quit() -> void:
	var payload := debug_get_state()
	if probe_state_path != "":
		DirAccess.make_dir_recursive_absolute(probe_state_path.get_base_dir())
		var state_file := FileAccess.open(probe_state_path, FileAccess.WRITE)
		if state_file:
			state_file.store_string(JSON.stringify(payload, "\t"))
	if probe_screenshot_path != "":
		_save_capture_image(probe_screenshot_path)
	get_tree().quit()


func _save_capture_image(target_path: String) -> bool:
	DirAccess.make_dir_recursive_absolute(target_path.get_base_dir())
	var image := _capture_probe_image()
	if image == null or image.is_empty():
		return false
	return image.save_png(target_path) == OK


func _capture_probe_image() -> Image:
	if DisplayServer.get_name() != "headless":
		var viewport_texture := get_viewport().get_texture()
		if viewport_texture != null:
			var viewport_image := viewport_texture.get_image()
			if viewport_image != null and not viewport_image.is_empty():
				return viewport_image
	return _build_probe_image()


func _build_probe_image() -> Image:
	var image_width := 1280
	var image_height := 720
	var image := Image.create(image_width, image_height, false, Image.FORMAT_RGBA8)
	var stage_rect := Rect2i(24, 24, image_width - 48, image_height - 48)
	var board_shell := Rect2i(int(BOARD_OFFSET.x - 30.0), int(BOARD_OFFSET.y - 40.0), int(BOARD_WIDTH * CELL_SIZE + 60.0), int(BOARD_HEIGHT * CELL_SIZE + 60.0))
	var board_rect := Rect2i(int(BOARD_OFFSET.x), int(BOARD_OFFSET.y), int(BOARD_WIDTH * CELL_SIZE), int(BOARD_HEIGHT * CELL_SIZE))
	var accent := _current_accent_color()
	var danger_ratio := _get_danger_ratio()
	image.fill(Color8(4, 7, 16))
	_probe_fill_rect(image, stage_rect, COLOR_BG_ALT)
	_probe_fill_rect(image, Rect2i(stage_rect.position.x, stage_rect.position.y, stage_rect.size.x, 4), COLOR_GOLD)
	_probe_fill_rect(image, Rect2i(stage_rect.position.x, stage_rect.end.y - 4, stage_rect.size.x, 4), Color8(31, 51, 84))
	_probe_fill_rect(image, Rect2i(int(SIDE_PANEL_X - 18.0), stage_rect.position.y + 44, int(stage_rect.end.x - SIDE_PANEL_X - 22.0), 2), Color(accent.r, accent.g, accent.b, 0.32))
	_probe_fill_rect(image, Rect2i(int(stage_rect.position.x + 18.0), int(stage_rect.end.y - 112.0), 248, 2), Color(COLOR_GOLD.r, COLOR_GOLD.g, COLOR_GOLD.b, 0.22))
	_probe_fill_rect(image, board_shell, COLOR_SURFACE)
	_probe_fill_rect(image, Rect2i(board_shell.position.x, board_shell.position.y, board_shell.size.x, 4), COLOR_GOLD)
	_probe_fill_rect(image, Rect2i(board_shell.position.x, board_shell.position.y + 44, board_shell.size.x, 3), accent)
	_probe_fill_rect(image, board_rect, COLOR_PANEL)
	if danger_ratio > 0.0:
		var alert_alpha := 0.04 + danger_ratio * 0.1
		_probe_fill_rect(image, Rect2i(board_rect.position.x, board_rect.position.y, board_rect.size.x, int(CELL_SIZE * 4.0)), Color(COLOR_RED.r, COLOR_RED.g, COLOR_RED.b, alert_alpha))
	for y in BOARD_HEIGHT + 1:
		var line_y := int(BOARD_OFFSET.y + y * CELL_SIZE)
		var line_color := Color8(48, 67, 104, 190) if y % 5 == 0 else Color8(28, 38, 60, 160)
		_probe_fill_rect(image, Rect2i(int(BOARD_OFFSET.x), line_y, int(BOARD_WIDTH * CELL_SIZE), 1), line_color)
	for x in BOARD_WIDTH + 1:
		var line_x := int(BOARD_OFFSET.x + x * CELL_SIZE)
		var column_color := Color8(48, 67, 104, 190) if x % 5 == 0 else Color8(28, 38, 60, 160)
		_probe_fill_rect(image, Rect2i(line_x, int(BOARD_OFFSET.y), 1, int(BOARD_HEIGHT * CELL_SIZE)), column_color)
	for y in BOARD_HEIGHT:
		for x in BOARD_WIDTH:
			var id: String = board[y][x]
			if id != "":
				_probe_fill_cell(image, Vector2i(x, y), PIECE_COLORS.get(id, Color.WHITE))
	if current_piece != "":
		var ghost_origin := _ghost_origin()
		for offset in PIECES[current_piece][current_rotation]:
			var ghost_block: Vector2i = ghost_origin + offset
			if ghost_block.y >= 0:
				_probe_fill_cell(image, ghost_block, PIECE_COLORS[current_piece].darkened(0.35), 0.45)
		for block in _current_cells():
			if block.y >= 0:
				_probe_fill_cell(image, block, PIECE_COLORS[current_piece], 1.0)
	var score_rect := Rect2i(int(SIDE_PANEL_X), 214, 276, 156)
	var hold_rect := Rect2i(int(SIDE_PANEL_X), 392, 276, 136)
	var next_rect := Rect2i(int(SIDE_PANEL_X + 302.0), 214, 442, 314)
	var info_rect := Rect2i(int(SIDE_PANEL_X), 550, 744, 116)
	_probe_fill_module_box(image, score_rect, COLOR_SURFACE, COLOR_GOLD)
	_probe_fill_module_box(image, hold_rect, COLOR_SURFACE, accent)
	_probe_fill_module_box(image, next_rect, COLOR_SURFACE, COLOR_ORANGE)
	_probe_fill_module_box(image, info_rect, COLOR_SURFACE_ALT, accent)
	_probe_fill_rect(image, Rect2i(int(SIDE_PANEL_X + 562.0), 92, 124, 10), accent)
	_probe_fill_rect(image, Rect2i(int(SIDE_PANEL_X + 562.0), 116, 148, 8), COLOR_GREEN if bridge_enabled else COLOR_MUTED)
	_probe_fill_rect(image, Rect2i(score_rect.position.x + 18, score_rect.position.y + 108, score_rect.size.x - 36, 2), Color8(62, 81, 122))
	var rail_rect := Rect2i(board_shell.position.x + board_shell.size.x - 14, board_shell.position.y + 56, 6, board_shell.size.y - 96)
	_probe_fill_rect(image, rail_rect, Color8(10, 16, 27))
	if danger_ratio > 0.0:
		var rail_fill := int(round(rail_rect.size.y * danger_ratio))
		if rail_fill > 0:
			_probe_fill_rect(image, Rect2i(rail_rect.position.x, rail_rect.position.y + rail_rect.size.y - rail_fill, rail_rect.size.x, rail_fill), COLOR_GREEN.lerp(COLOR_RED, clampf(danger_ratio * 1.15, 0.0, 1.0)))
	if hold_piece != "":
		_probe_fill_preview_piece(image, Rect2i(hold_rect.position.x + 18, hold_rect.position.y + 54, hold_rect.size.x - 36, hold_rect.size.y - 64), hold_piece, 1.15)
	for index in min(queue.size(), 5):
		var preview_rect := Rect2i(next_rect.position.x + 18, next_rect.position.y + 66 + index * 48, next_rect.size.x - 36, 42)
		_probe_fill_rect(image, preview_rect, Color8(13, 20, 34))
		_probe_fill_rect(image, Rect2i(preview_rect.position.x, preview_rect.position.y, preview_rect.size.x, 1), Color8(45, 57, 84))
		_probe_fill_preview_piece(image, preview_rect, queue[index], 0.72)
	for keycap_rect in [
		Rect2i(info_rect.position.x + 18, info_rect.position.y + 54, 64, 26),
		Rect2i(info_rect.position.x + 150, info_rect.position.y + 54, 64, 26),
		Rect2i(info_rect.position.x + 286, info_rect.position.y + 54, 60, 26),
		Rect2i(info_rect.position.x + 418, info_rect.position.y + 54, 68, 26),
		Rect2i(info_rect.position.x + 566, info_rect.position.y + 54, 78, 26)
	]:
		_probe_fill_rect(image, keycap_rect, Color8(18, 25, 42))
		_probe_fill_rect(image, Rect2i(keycap_rect.position.x, keycap_rect.position.y, keycap_rect.size.x, 1), Color8(66, 88, 132))
	_probe_fill_rect(image, Rect2i(info_rect.position.x + 18, info_rect.position.y + 92, info_rect.size.x - 36, 1), Color8(54, 72, 112))
	return image


func _probe_fill_module_box(image: Image, rect: Rect2i, fill_color: Color, accent_color: Color) -> void:
	_probe_fill_rect(image, rect, fill_color)
	_probe_fill_rect(image, Rect2i(rect.position.x, rect.position.y, rect.size.x, 5), accent_color)
	_probe_fill_rect(image, Rect2i(rect.position.x, rect.position.y + rect.size.y - 3, rect.size.x, 3), Color(accent_color.r, accent_color.g, accent_color.b, 0.3))
	_probe_fill_rect(image, Rect2i(rect.position.x + rect.size.x - 26, rect.position.y, 26, 5), COLOR_TEXT)


func _probe_fill_preview_piece(image: Image, rect: Rect2i, piece_id: String, preview_scale := 1.0) -> void:
	var color: Color = PIECE_COLORS[piece_id]
	var cells: Array = PIECES[piece_id][0]
	var min_x := 999
	var min_y := 999
	var max_x := -999
	var max_y := -999
	for cell in cells:
		min_x = mini(min_x, cell.x)
		min_y = mini(min_y, cell.y)
		max_x = maxi(max_x, cell.x)
		max_y = maxi(max_y, cell.y)
	var preview_cell_size: int = max(8, int(round(18.0 * preview_scale)))
	var content_width: int = (max_x - min_x + 1) * preview_cell_size
	var content_height: int = (max_y - min_y + 1) * preview_cell_size
	var start := Vector2i(
		rect.position.x + int((rect.size.x - content_width) * 0.5),
		rect.position.y + int((rect.size.y - content_height) * 0.5)
	)
	for cell in cells:
		var pos := start + Vector2i(int(cell.x - min_x) * preview_cell_size, int(cell.y - min_y) * preview_cell_size)
		_probe_fill_rect(image, Rect2i(pos.x, pos.y, preview_cell_size - 3, preview_cell_size - 3), color)
		_probe_fill_rect(image, Rect2i(pos.x, pos.y, preview_cell_size - 3, 3), color.lightened(0.18))
		_probe_fill_rect(image, Rect2i(pos.x, pos.y + preview_cell_size - 6, preview_cell_size - 3, 3), color.darkened(0.18))


func _probe_fill_cell(image: Image, cell: Vector2i, color: Color, alpha := 1.0) -> void:
	var pos := BOARD_OFFSET + Vector2(cell.x * CELL_SIZE, cell.y * CELL_SIZE)
	var x := int(pos.x) + 1
	var y := int(pos.y) + 1
	var size := int(CELL_SIZE) - 2
	var base_color := Color(color.r, color.g, color.b, alpha)
	_probe_fill_rect(image, Rect2i(x, y, size, size), base_color)
	_probe_fill_rect(image, Rect2i(x, y, size, 6), color.lightened(0.22))
	_probe_fill_rect(image, Rect2i(x, y + size - 5, size, 5), color.darkened(0.25))
	_probe_fill_rect(image, Rect2i(x + 2, y + 2, size - 10, size - 12), Color(1.0, 1.0, 1.0, 0.08 * alpha))
	_probe_fill_rect(image, Rect2i(x + 4, y + 4, size - 18, 6), Color(1.0, 1.0, 1.0, 0.18 * alpha))
	_probe_fill_rect(image, Rect2i(x + size - 8, y + 4, 4, size - 12), Color(color.r, color.g, color.b, 0.26 * alpha))


func _probe_fill_rect(image: Image, rect: Rect2i, color: Color) -> void:
	var image_width := image.get_width()
	var image_height := image.get_height()
	var start_x := maxi(rect.position.x, 0)
	var start_y := maxi(rect.position.y, 0)
	var end_x := mini(rect.position.x + rect.size.x, image_width)
	var end_y := mini(rect.position.y + rect.size.y, image_height)
	if start_x >= end_x or start_y >= end_y:
		return
	for py in range(start_y, end_y):
		for px in range(start_x, end_x):
			if color.a >= 0.999:
				image.set_pixel(px, py, Color(color.r, color.g, color.b, 1.0))
			else:
				var current := image.get_pixel(px, py)
				var blended := current.lerp(color, color.a)
				blended.a = 1.0
				image.set_pixel(px, py, blended)


func _build_bridge_state_summary() -> Dictionary:
	return {
		"score": score,
		"lines": lines_cleared,
		"level": level,
		"pieces_locked": pieces_locked,
		"stack_height": _get_stack_height(),
		"danger_ratio": _get_danger_ratio(),
		"lines_to_next_level": _get_lines_to_next_level(),
		"current_piece": current_piece,
		"current_rotation": current_rotation,
		"current_origin": {"x": current_origin.x, "y": current_origin.y},
		"hold_piece": hold_piece,
		"paused": paused,
		"game_over": game_over,
		"locked_cells": _count_total_locked_cells()
	}


func _count_total_locked_cells() -> int:
	var total := 0
	for row in board:
		for cell in row:
			if cell != "":
				total += 1
	return total


func debug_get_state() -> Dictionary:
	var locked_cells := _count_total_locked_cells()
	var current_cells: Array = []
	for block in _current_cells():
		current_cells.append({"x": block.x, "y": block.y})
	var ghost := _ghost_origin()
	return {
		"score": score,
		"lines": lines_cleared,
		"level": level,
		"pieces_locked": pieces_locked,
		"stack_height": _get_stack_height(),
		"danger_ratio": _get_danger_ratio(),
		"lines_to_next_level": _get_lines_to_next_level(),
		"current_piece": current_piece,
		"current_rotation": current_rotation,
		"current_origin": {"x": current_origin.x, "y": current_origin.y},
		"current_cells": current_cells,
		"ghost_origin": {"x": ghost.x, "y": ghost.y},
		"hold_piece": hold_piece,
		"queue": queue.duplicate(),
		"game_over": game_over,
		"paused": paused,
		"locked_cells": locked_cells,
		"board_bottom_row": board[BOARD_HEIGHT - 1].duplicate(),
		"board": board.duplicate(true)
	}


func debug_fill_row_with_gap(row_index: int, gap_x: int, fill_piece := "G") -> void:
	for x in BOARD_WIDTH:
		board[row_index][x] = "" if x == gap_x else fill_piece


func debug_spawn_piece_for_test(piece_id: String, piece_rotation: int, origin: Vector2i) -> bool:
	if not PIECES.has(piece_id):
		return false
	if not _is_valid_position(piece_id, piece_rotation, origin):
		return false
	current_piece = piece_id
	current_rotation = piece_rotation
	current_origin = origin
	return true


func debug_hard_drop_current_piece() -> void:
	_hard_drop_internal()
