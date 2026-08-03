# SPDX-License-Identifier: LGPL-2.1-or-later
#
# Godot oracle for the Buddy Life chemical pool.
#
# Loads the REAL donor script from prismtek-buddy-core and emits canonical JSON
# for a set of deterministic fixtures. The TypeScript port is then run against
# the same fixtures and deep-compared. This is an oracle, not a reimplementation:
# it must never contain its own chemistry.
extends SceneTree

const OUTPUT_ENV := "PBP_ORACLE_OUT"

func _initialize() -> void:
	var Pool = load("res://addons/prismtek_buddy_core/life/buddy_biology_chemical_pool.gd")
	if Pool == null:
		push_error("could not load donor chemical pool script")
		quit(2)
		return

	var fixtures: Array = []

	# --- defaults ---------------------------------------------------------
	var pool = Pool.new()
	fixtures.append(_capture("defaults", pool, {}))

	# --- named C2e loci ---------------------------------------------------
	pool = Pool.new()
	for entry in [[35, 0.9], [36, 0.4], [78, 0.7], [79, 0.3], [127, 0.55], [0, 1.0]]:
		pool.set_concentration(int(entry[0]), float(entry[1]))
	fixtures.append(_capture("named_loci_set", pool, {}))

	# --- clamping ---------------------------------------------------------
	pool = Pool.new()
	pool.set_concentration(35, 5.0)
	pool.set_concentration(36, -5.0)
	pool.set_half_life(35, 9999)
	pool.set_half_life(36, -20)
	fixtures.append(_capture("clamping", pool, {}))

	# --- half-life boundaries across a single tick ------------------------
	for encoded in [0, 1, 10, 50, 128, 200, 254, 255]:
		pool = Pool.new()
		for id in range(1, 256):
			pool.set_half_life(id, encoded)
			pool.set_concentration(id, 1.0)
		pool.set_concentration(0, 1.0)
		pool.tick_half_lives(1)
		fixtures.append(_capture("halflife_encoded_%d_step1" % encoded, pool, {"encoded": encoded, "steps": 1}))

	# --- multiple elapsed steps -------------------------------------------
	for steps in [0, 1, 3, 7, 25]:
		pool = Pool.new()
		pool.set_half_life(35, 10)
		pool.set_concentration(35, 1.0)
		pool.tick_half_lives(steps)
		fixtures.append(_capture("multi_step_%d" % steps, pool, {"steps": steps}))

	# --- negative elapsed --------------------------------------------------
	pool = Pool.new()
	pool.set_half_life(35, 10)
	pool.set_concentration(35, 0.5)
	pool.tick_half_lives(-99)
	fixtures.append(_capture("negative_steps", pool, {"steps": -99}))

	# --- save / load round trip -------------------------------------------
	pool = Pool.new()
	pool.set_concentration(35, 0.75)
	pool.set_half_life(127, 12)
	var saved := {
		"concentrations": _floats(pool.concentrations),
		"half_lives": _ints(pool.half_lives),
	}
	var reloaded = Pool.new()
	for i in range(256):
		reloaded.set_concentration(i, float(saved["concentrations"][i]))
		reloaded.set_half_life(i, int(saved["half_lives"][i]))
	fixtures.append(_capture("save_load_roundtrip", reloaded, {}))

	# --- deterministic replay ---------------------------------------------
	var a = Pool.new()
	var b = Pool.new()
	for p in [a, b]:
		p.set_half_life(35, 33)
		p.set_concentration(35, 1.0)
	a.tick_half_lives(9)
	for i in range(9):
		b.tick_half_lives(1)
	fixtures.append(_capture("replay_batched", a, {"steps": 9}))
	fixtures.append(_capture("replay_iterated", b, {"steps": 9}))

	var payload := {
		"schema": "pbp-chemical-pool-oracle-v1",
		"donor": "prismtek-buddy-core/addons/prismtek_buddy_core/life/buddy_biology_chemical_pool.gd",
		"upstream_revision": "6a4396c83152fe9f9152be924b5a8edc8e759a6a",
		"godot_version": Engine.get_version_info(),
		"fixtures": fixtures,
	}

	var out_path := OS.get_environment(OUTPUT_ENV)
	if out_path.is_empty():
		out_path = "res://oracle.json"
	var file := FileAccess.open(out_path, FileAccess.WRITE)
	if file == null:
		push_error("cannot write oracle output to %s" % out_path)
		quit(3)
		return
	file.store_string(JSON.stringify(payload, "  "))
	file.close()
	print("oracle fixtures written: %d -> %s" % [fixtures.size(), out_path])
	quit(0)


func _capture(name: String, pool, inputs: Dictionary) -> Dictionary:
	return {
		"fixture": name,
		"inputs": inputs,
		"concentrations": _floats(pool.concentrations),
		"half_lives": _ints(pool.half_lives),
	}


func _floats(packed) -> Array:
	var out: Array = []
	for value in packed:
		out.append(float(value))
	return out


func _ints(packed) -> Array:
	var out: Array = []
	for value in packed:
		out.append(int(value))
	return out
