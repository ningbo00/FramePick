# FramePick Importer for Godot 4

This editor plugin imports FramePick `.fpseq` packages as a `FramePickSequence` resource. It is distributed by the optional FramePick Godot adapter and is not part of the engine-neutral FramePick core.

## Install

Copy `addons/framepick_importer` into the Godot project, then enable **FramePick Importer** under **Project > Project Settings > Plugins**. FramePick can perform this copy with **Export > Godot 4 > Install plugin into Godot project**.

## Import and use

1. Export a **Godot 4 animation package** from FramePick into a folder under the Godot project's `res://` tree.
2. Wait for Godot to import the `.fpseq` file and its `frames/*.png` dependencies. The importer also generates `<name>_animations.tres`, a visible native `AnimationLibrary`.
3. Add a `FramePickPlayer2D` node and assign the imported `.fpseq` resource to its `sequence` property.
4. Place the node through a parent `Node2D`. The imported whole-image position keys are relative to the `FramePickPlayer2D` origin.

## Native Godot animations

The generated `<name>_animations.tres` contains two native animations:

- `motion`: five Bezier tracks for whole-image X/Y, scale X/Y, and rotation;
- `controller`: the same five Bezier tracks plus a discrete frame-index track whose key times use the exact FramePick `delayMs` values.

To inspect and play them through Godot's Animation panel with an existing character hierarchy:

1. Add an `AnimationPlayer` as a child of `FramePickSequenceController`.
2. Set the `AnimationPlayer.root_node` to `..`.
3. Add an animation library named `framepick` and load `<name>_animations.tres`.
4. Set `FramePickSequenceController.autoplay` to `false` so its legacy clock does not compete with `AnimationPlayer`.
5. Select `framepick/controller` to play both frame delays and whole-image motion, or `framepick/motion` for motion only.

The native tracks animate controller channels, and the controller applies them relative to the target's captured base transform. This keeps a `FootPivot` at `(0, 12)` anchored while preserving its existing scale and rotation. The generated `.tres` is owned by the `.fpseq` import and is overwritten when the package is reimported; duplicate it before making Godot-only edits that must survive a FramePick re-export.

### Existing Sprite2D and foot-pivot hierarchies

Use `FramePickSequenceController` when the game already owns a `Sprite2D` and its layout transform. The controller changes the target sprite's texture without replacing the node type, and can apply FramePick motion to a separate visual root.

Recommended character hierarchy:

```text
Player
├─ FramePickSequenceController
└─ FootPivot                 position = (0, 12)
   ├─ Sprite                 position = (0, -42)
   ├─ star-stack sprites
   ├─ MaxStarGlow
   └─ alternate pose sprites
```

Set these Inspector properties on `FramePickSequenceController`:

- `sequence`: the imported `.fpseq` resource;
- `frame_target_path`: `../FootPivot/Sprite`;
- `motion_target_path`: `../FootPivot`.

FramePick position is added to the target's initial position, scale is multiplied by its initial scale, and rotation is added to its initial rotation. A FramePick identity key `(0, 0, 100%, 0°)` therefore keeps `FootPivot` at `(0, 12)`. Breathing scale and rotation happen around the `FootPivot` origin, so the feet stay locked while every visual child inherits the motion. The controller never overwrites `Sprite.position` or `Sprite.scale`.

Keep the controller as a sibling of `FootPivot`, not inside `Sprite`. If game code already drives frame textures, disable `drive_frame_target` and use only the imported motion curve. If game code changes the FootPivot base transform after startup, stop playback, call `capture_motion_base()`, then resume.

The imported resource contains:

- `SpriteFrames` with exact per-frame duration multipliers;
- the original `frame_delays_ms` array;
- a five-track `Animation` for position X/Y, scale X/Y, and rotation;
- a visible generated native `AnimationLibrary` with `motion` and `controller` animations;
- FramePick Cubic Bezier handles converted to Godot Bezier track handles;
- loop, canvas, source-canvas, and content-offset metadata.

FramePick does not bake the whole-image animation into the PNG pixels. `FramePickPlayer2D` remains the simple standalone player. `FramePickSequenceController` is the integration-oriented player for existing `Sprite2D`/visual-root hierarchies.
