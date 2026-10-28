;; face_math.wat
;;
;; WebAssembly implementation of the CPU-bound face-recognition math that
;; previously ran in plain JavaScript inside faceRecognition.worker.js.
;;
;; Functions exported:
;;   calculate_head_pose  (landmarks_ptr i32, out_ptr i32)
;;   euclidean_distance   (a_ptr i32, b_ptr i32, n i32) -> f32
;;   max_head_movement    (poses_ptr i32, count i32) -> f32
;;
;; Memory layout expected by callers (JS side must share the same linear memory
;; or pass typed-array pointers into the module's memory export):
;;
;;   landmarks  : 68 × 2 f32 values  = 136 × 4 bytes
;;   out        : 3  × f32           = 3  × 4 bytes
;;   poses      : count × 3 f32
;;   a / b      : n f32 each         (face descriptor = 128 f32)
;;
;; Compiled with:
;;   ./node_modules/.bin/wat2wasm src/wasm/face_math.wat -o public/face_math.wasm

(module
  ;; One 64 KiB page is enough for all temporary data
  (memory (export "memory") 1)

  ;; ── Internal: fast atan2 (Padé approximant) ─────────────────────────────────
  ;;
  ;; Uses the identity atan(r) ≈ r / (1 + 0.28125·r²) for |r| ≤ 1,
  ;; extended with the reflection atan(r) = π/2 - atan(1/r) for |r| > 1,
  ;; and the standard quadrant correction for x < 0.
  ;; Max error < 0.3° — more than enough for head-pose angle estimation.
  ;;
  (func $atan2f (param $y f32) (param $x f32) (result f32)
    (local $r    f32)
    (local $abs_r f32)
    (local $atan  f32)

    ;; x == 0 edge cases
    (if (f32.eq (local.get $x) (f32.const 0.0))
      (then
        (if (f32.gt (local.get $y) (f32.const 0.0))
          (then (return (f32.const  1.5707963268))))
        (if (f32.lt (local.get $y) (f32.const 0.0))
          (then (return (f32.const -1.5707963268))))
        (return (f32.const 0.0))
      )
    )

    (local.set $r     (f32.div (local.get $y) (local.get $x)))
    (local.set $abs_r (f32.abs (local.get $r)))

    (if (f32.le (local.get $abs_r) (f32.const 1.0))
      (then
        ;; atan(r) ≈ r / (1 + 0.28125·r²)
        (local.set $atan
          (f32.div
            (local.get $r)
            (f32.add
              (f32.const 1.0)
              (f32.mul (f32.const 0.28125)
                       (f32.mul (local.get $r) (local.get $r)))
            )
          )
        )
      )
      (else
        ;; |r| > 1: ±π/2 − r/(r²+0.28125)
        (local.set $atan
          (f32.sub
            (if (result f32) (f32.gt (local.get $r) (f32.const 0.0))
              (then (f32.const  1.5707963268))
              (else (f32.const -1.5707963268))
            )
            (f32.div
              (local.get $r)
              (f32.add
                (f32.mul (local.get $r) (local.get $r))
                (f32.const 0.28125)
              )
            )
          )
        )
      )
    )

    ;; Quadrant correction: if x < 0, add ±π
    (if (f32.lt (local.get $x) (f32.const 0.0))
      (then
        (local.set $atan
          (f32.add
            (local.get $atan)
            (if (result f32) (f32.ge (local.get $y) (f32.const 0.0))
              (then (f32.const  3.1415926536))
              (else (f32.const -3.1415926536))
            )
          )
        )
      )
    )

    (local.get $atan)
  )

  ;; ── calculate_head_pose ──────────────────────────────────────────────────────
  ;;
  ;; Computes the three Euler-like head-pose angles from the 68-point dlib
  ;; face landmark set.
  ;;
  ;; param landmarks_ptr  pointer to 136 f32 values (68 × [x, y])
  ;; param out_ptr        pointer to 3  f32 values  [horizontal, vertical, roll]
  ;;                      written in degrees
  ;;
  ;; Key landmark indices (zero-based):
  ;;   8  chin
  ;;  30  nose tip
  ;;  36  left  eye (outer corner)
  ;;  45  right eye (outer corner)
  ;;
  (func (export "calculate_head_pose")
    (param $lm  i32)
    (param $out i32)

    (local $nose_x  f32) (local $nose_y  f32)
    (local $le_x    f32) (local $le_y    f32)
    (local $re_x    f32) (local $re_y    f32)
    (local $chin_x  f32) (local $chin_y  f32)
    (local $cx      f32) (local $cy      f32)
    (local $rad2deg f32)

    (local.set $rad2deg (f32.const 57.29577951))

    ;; Each point is 2 f32 = 8 bytes.  offset = index × 8
    ;; point 30 → byte offset 240
    (local.set $nose_x (f32.load (i32.add (local.get $lm) (i32.const 240))))
    (local.set $nose_y (f32.load (i32.add (local.get $lm) (i32.const 244))))

    ;; point 36 → byte offset 288
    (local.set $le_x   (f32.load (i32.add (local.get $lm) (i32.const 288))))
    (local.set $le_y   (f32.load (i32.add (local.get $lm) (i32.const 292))))

    ;; point 45 → byte offset 360
    (local.set $re_x   (f32.load (i32.add (local.get $lm) (i32.const 360))))
    (local.set $re_y   (f32.load (i32.add (local.get $lm) (i32.const 364))))

    ;; point 8 → byte offset 64
    (local.set $chin_x (f32.load (i32.add (local.get $lm) (i32.const  64))))
    (local.set $chin_y (f32.load (i32.add (local.get $lm) (i32.const  68))))

    ;; Face centre (midpoint of both eye corners)
    (local.set $cx (f32.mul (f32.add (local.get $le_x) (local.get $re_x)) (f32.const 0.5)))
    (local.set $cy (f32.mul (f32.add (local.get $le_y) (local.get $re_y)) (f32.const 0.5)))

    ;; horizontal = atan2(nose_x − cx,  |nose_y − cy| + 1)  × RAD2DEG
    (f32.store (local.get $out)
      (f32.mul
        (call $atan2f
          (f32.sub (local.get $nose_x) (local.get $cx))
          (f32.add
            (f32.abs (f32.sub (local.get $nose_y) (local.get $cy)))
            (f32.const 1.0)
          )
        )
        (local.get $rad2deg)
      )
    )

    ;; vertical = atan2(chin_y − cy,  |chin_x − cx| + 1)  × RAD2DEG
    (f32.store (i32.add (local.get $out) (i32.const 4))
      (f32.mul
        (call $atan2f
          (f32.sub (local.get $chin_y) (local.get $cy))
          (f32.add
            (f32.abs (f32.sub (local.get $chin_x) (local.get $cx)))
            (f32.const 1.0)
          )
        )
        (local.get $rad2deg)
      )
    )

    ;; roll = atan2(re_y − le_y,  re_x − le_x)  × RAD2DEG
    (f32.store (i32.add (local.get $out) (i32.const 8))
      (f32.mul
        (call $atan2f
          (f32.sub (local.get $re_y) (local.get $le_y))
          (f32.sub (local.get $re_x) (local.get $le_x))
        )
        (local.get $rad2deg)
      )
    )
  )

  ;; ── euclidean_distance ───────────────────────────────────────────────────────
  ;;
  ;; Computes ||a − b||₂ for two f32 arrays of length n.
  ;; Used to compare 128-element face descriptors.
  ;;
  (func (export "euclidean_distance")
    (param $a i32)
    (param $b i32)
    (param $n i32)
    (result f32)

    (local $sum f32)
    (local $i   i32)
    (local $d   f32)
    (local $off i32)

    (local.set $sum (f32.const 0.0))
    (local.set $i   (i32.const 0))

    (block $brk
      (loop $lp
        (br_if $brk (i32.ge_s (local.get $i) (local.get $n)))

        ;; byte offset of element i = i × 4
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))

        (local.set $d
          (f32.sub
            (f32.load (i32.add (local.get $a) (local.get $off)))
            (f32.load (i32.add (local.get $b) (local.get $off)))
          )
        )
        (local.set $sum
          (f32.add (local.get $sum) (f32.mul (local.get $d) (local.get $d)))
        )

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $lp)
      )
    )

    (f32.sqrt (local.get $sum))
  )

  ;; ── max_head_movement ────────────────────────────────────────────────────────
  ;;
  ;; Returns the maximum frame-to-frame Euclidean movement across a sequence
  ;; of head-pose triples [horizontal, vertical, roll].
  ;;
  ;; param poses_ptr  pointer to count × 3 f32 values
  ;; param count      number of pose samples
  ;;
  (func (export "max_head_movement")
    (param $poses i32)
    (param $count i32)
    (result f32)

    (local $mx   f32)
    (local $i    i32)
    (local $prev i32)
    (local $curr i32)
    (local $dh   f32)
    (local $dv   f32)
    (local $dr   f32)
    (local $m    f32)

    (local.set $mx (f32.const 0.0))
    (local.set $i  (i32.const 1))

    (block $brk
      (loop $lp
        (br_if $brk (i32.ge_s (local.get $i) (local.get $count)))

        ;; Each pose is 3 f32 = 12 bytes
        (local.set $prev
          (i32.add (local.get $poses)
            (i32.mul (i32.sub (local.get $i) (i32.const 1)) (i32.const 12)))
        )
        (local.set $curr
          (i32.add (local.get $poses)
            (i32.mul (local.get $i) (i32.const 12)))
        )

        (local.set $dh
          (f32.abs (f32.sub
            (f32.load (local.get $curr))
            (f32.load (local.get $prev))
          ))
        )
        (local.set $dv
          (f32.abs (f32.sub
            (f32.load (i32.add (local.get $curr) (i32.const 4)))
            (f32.load (i32.add (local.get $prev) (i32.const 4)))
          ))
        )
        (local.set $dr
          (f32.abs (f32.sub
            (f32.load (i32.add (local.get $curr) (i32.const 8)))
            (f32.load (i32.add (local.get $prev) (i32.const 8)))
          ))
        )

        (local.set $m
          (f32.sqrt
            (f32.add
              (f32.add
                (f32.mul (local.get $dh) (local.get $dh))
                (f32.mul (local.get $dv) (local.get $dv))
              )
              (f32.mul (local.get $dr) (local.get $dr))
            )
          )
        )

        (if (f32.gt (local.get $m) (local.get $mx))
          (then (local.set $mx (local.get $m)))
        )

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $lp)
      )
    )

    (local.get $mx)
  )
)
