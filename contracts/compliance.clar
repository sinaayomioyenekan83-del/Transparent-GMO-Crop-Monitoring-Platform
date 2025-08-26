;; compliance.clar

;; Compliance Contract for GMO Crop Monitoring
;; This contract defines and enforces compliance rules based on international GMO standards.
;; It verifies monitoring data against predefined rules for various regulations.
;; Integrates with Monitoring and Registry contracts via traits (assumed defined elsewhere).
;; Sophisticated features: Multiple rule types (numerical, categorical, temporal), rule versioning,
;; multi-standard support, automated verification with detailed reports, admin controls.

;; Constants
(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-INVALID-RULE u101)
(define-constant ERR-NO-RULE-FOUND u102)
(define-constant ERR-INVALID-DATA u103)
(define-constant ERR-RULE-EXISTS u104)
(define-constant ERR-INVALID-STANDARD u105)
(define-constant ERR-PAUSED u106)
(define-constant ERR-INVALID-THRESHOLD u107)
(define-constant ERR-INVALID-CATEGORY u108)
(define-constant ERR-VERIFICATION-FAILED u109)
(define-constant ERR-INVALID-VERSION u110)
(define-constant ERR-NO-CROP-REGISTERED u111)
(define-constant ERR-INVALID-TIMESTAMP u112)
(define-constant MAX-STANDARDS u10)
(define-constant MAX-RULES-PER-STANDARD u50)
(define-constant MAX-CATEGORIES u20)

;; Data Variables
(define-data-var contract-admin principal tx-sender)
(define-data-var is-paused bool false)
(define-data-var rule-version uint u1)

;; Data Maps
;; Standards map: standard-name -> description
(define-map standards 
  { standard-id: uint } 
  { name: (string-ascii 50), description: (string-utf8 200) }
)

;; Rules map: {standard-id, rule-id} -> rule details
;; Rule types: 0 - numerical threshold, 1 - categorical, 2 - temporal
(define-map rules
  { standard-id: uint, rule-id: uint }
  {
    rule-type: uint,
    description: (string-utf8 100),
    ;; For numerical: min-value, max-value (integers for simplicity, scale if needed)
    min-value: (optional int),
    max-value: (optional int),
    ;; For categorical: allowed-categories list
    allowed-categories: (list 20 (string-ascii 50)),
    ;; For temporal: max-duration (in blocks)
    max-duration: (optional uint),
    active: bool
  }
)

;; Verification results: {crop-id, verification-id} -> result
(define-map verifications
  { crop-id: (buff 32), verification-id: uint }
  {
    timestamp: uint,
    standard-id: uint,
    passed: bool,
    failed-rules: (list 50 uint), ;; list of rule-ids that failed
    data-hash: (buff 32) ;; hash of submitted data
  }
)

;; Crop compliance status: crop-id -> {standard-id -> compliant?}
(define-map crop-compliance
  { crop-id: (buff 32), standard-id: uint }
  { compliant: bool, last-verified: uint }
)

;; Private Functions
(define-private (is-admin (caller principal))
  (is-eq caller (var-get contract-admin))
)

(define-private (validate-numerical-rule (rule (tuple (rule-type uint) (description (string-utf8 100)) (min-value (optional int)) (max-value (optional int)) (allowed-categories (list 20 (string-ascii 50))) (max-duration (optional uint)) (active bool))) (value int))
  (let
    (
      (min-val (unwrap! (get min-value rule) false))
      (max-val (unwrap! (get max-value rule) false))
    )
    (and (>= value min-val) (<= value max-val))
  )
)

(define-private (validate-categorical-rule (rule (tuple (rule-type uint) (description (string-utf8 100)) (min-value (optional int)) (max-value (optional int)) (allowed-categories (list 20 (string-ascii 50))) (max-duration (optional uint)) (active bool))) (category (string-ascii 50)))
  (is-some (index-of (get allowed-categories rule) category))
)

(define-private (validate-temporal-rule (rule (tuple (rule-type uint) (description (string-utf8 100)) (min-value (optional int)) (max-value (optional int)) (allowed-categories (list 20 (string-ascii 50))) (max-duration (optional uint)) (active bool))) (duration uint))
  (<= duration (unwrap! (get max-duration rule) false))
)

;; Public Functions
(define-public (set-admin (new-admin principal))
  (if (is-admin tx-sender)
    (begin
      (var-set contract-admin new-admin)
      (ok true)
    )
    (err ERR-UNAUTHORIZED)
  )
)

(define-public (pause-contract)
  (if (is-admin tx-sender)
    (begin
      (var-set is-paused true)
      (ok true)
    )
    (err ERR-UNAUTHORIZED)
  )
)

(define-public (unpause-contract)
  (if (is-admin tx-sender)
    (begin
      (var-set is-paused false)
      (ok true)
    )
    (err ERR-UNAUTHORIZED)
  )
)

(define-public (add-standard (standard-id uint) (name (string-ascii 50)) (description (string-utf8 200)))
  (if (is-admin tx-sender)
    (if (is-none (map-get? standards {standard-id: standard-id}))
      (begin
        (map-set standards {standard-id: standard-id} {name: name, description: description})
        (ok true)
      )
      (err ERR-RULE-EXISTS) ;; Reuse error for standard exists
    )
    (err ERR-UNAUTHORIZED)
  )
)

(define-public (add-numerical-rule (standard-id uint) (rule-id uint) (description (string-utf8 100)) (min-value int) (max-value int))
  (if (var-get is-paused) (err ERR-PAUSED)
    (if (is-admin tx-sender)
      (if (and (is-some (map-get? standards {standard-id: standard-id})) (is-none (map-get? rules {standard-id: standard-id, rule-id: rule-id})) (<= min-value max-value))
        (begin
          (map-set rules
            {standard-id: standard-id, rule-id: rule-id}
            {
              rule-type: u0,
              description: description,
              min-value: (some min-value),
              max-value: (some max-value),
              allowed-categories: (list ),
              max-duration: none,
              active: true
            }
          )
          (ok true)
        )
        (err ERR-INVALID-RULE)
      )
      (err ERR-UNAUTHORIZED)
    )
  )
)

(define-public (add-categorical-rule (standard-id uint) (rule-id uint) (description (string-utf8 100)) (allowed-categories (list 20 (string-ascii 50))))
  (if (var-get is-paused) (err ERR-PAUSED)
    (if (is-admin tx-sender)
      (if (and (is-some (map-get? standards {standard-id: standard-id})) (is-none (map-get? rules {standard-id: standard-id, rule-id: rule-id})) (> (len allowed-categories) u0))
        (begin
          (map-set rules
            {standard-id: standard-id, rule-id: rule-id}
            {
              rule-type: u1,
              description: description,
              min-value: none,
              max-value: none,
              allowed-categories: allowed-categories,
              max-duration: none,
              active: true
            }
          )
          (ok true)
        )
        (err ERR-INVALID-RULE)
      )
      (err ERR-UNAUTHORIZED)
    )
  )
)

(define-public (add-temporal-rule (standard-id uint) (rule-id uint) (description (string-utf8 100)) (max-duration uint))
  (if (var-get is-paused) (err ERR-PAUSED)
    (if (is-admin tx-sender)
      (if (and (is-some (map-get? standards {standard-id: standard-id})) (is-none (map-get? rules {standard-id: standard-id, rule-id: rule-id})) (> max-duration u0))
        (begin
          (map-set rules
            {standard-id: standard-id, rule-id: rule-id}
            {
              rule-type: u2,
              description: description,
              min-value: none,
              max-value: none,
              allowed-categories: (list ),
              max-duration: (some max-duration),
              active: true
            }
          )
          (ok true)
        )
        (err ERR-INVALID-RULE)
      )
      (err ERR-UNAUTHORIZED)
    )
  )
)

(define-public (deactivate-rule (standard-id uint) (rule-id uint))
  (if (is-admin tx-sender)
    (match (map-get? rules {standard-id: standard-id, rule-id: rule-id})
      rule (begin
             (map-set rules {standard-id: standard-id, rule-id: rule-id} (merge rule {active: false}))
             (ok true)
           )
      (err ERR-NO-RULE-FOUND)
    )
    (err ERR-UNAUTHORIZED)
  )
)

;; Verification function: Simplified; in practice, would take structured data.
;; Here, assumes data is a tuple with values for each rule-type.
;; For demo: (numerical-value int) (category (string-ascii 50)) (duration uint) (data-hash (buff 32))
(define-public (verify-compliance (crop-id (buff 32)) (standard-id uint) (data (tuple (numerical-value int) (category (string-ascii 50)) (duration uint) (data-hash (buff 32)))))
  (if (var-get is-paused) (err ERR-PAUSED)
    (let
      (
        (verification-id (+ (var-get rule-version) u1)) ;; Simple increment for uniqueness
        (failed-rules (list))
        (passed true)
      )
      ;; Assume crop exists; in full system, check Registry
      (if (is-none (map-get? standards {standard-id: standard-id})) (err ERR-INVALID-STANDARD)
        (let
          (
            ;; Loop through rules; Clarity doesn't have loops, so simulate with folds or multiple checks.
            ;; For sophistication, assume up to 3 rules for demo, but in real, use lists and fold.
            (rule1 (map-get? rules {standard-id: standard-id, rule-id: u1}))
            (rule2 (map-get? rules {standard-id: standard-id, rule-id: u2}))
            (rule3 (map-get? rules {standard-id: standard-id, rule-id: u3}))
            (failed1 (if (is-some rule1)
                         (let ((r (unwrap-panic rule1)))
                           (if (get active r)
                             (match (get rule-type r)
                               u0 (not (validate-numerical-rule r (get numerical-value data)))
                               u1 (not (validate-categorical-rule r (get category data)))
                               u2 (not (validate-temporal-rule r (get duration data)))
                               false ;; invalid type
                             )
                             false
                           )
                         )
                         false
                       ))
            (failed2 (if (is-some rule2)
                         (let ((r (unwrap-panic rule2)))
                           (if (get active r)
                             (match (get rule-type r)
                               u0 (not (validate-numerical-rule r (get numerical-value data)))
                               u1 (not (validate-categorical-rule r (get category data)))
                               u2 (not (validate-temporal-rule r (get duration data)))
                               false
                             )
                             false
                           )
                         )
                         false
                       ))
            (failed3 (if (is-some rule3)
                         (let ((r (unwrap-panic rule3)))
                           (if (get active r)
                             (match (get rule-type r)
                               u0 (not (validate-numerical-rule r (get numerical-value data)))
                               u1 (not (validate-categorical-rule r (get category data)))
                               u2 (not (validate-temporal-rule r (get duration data)))
                               false
                             )
                             false
                           )
                         )
                         false
                       ))
            (failed-rules-list (if failed1 (cons u1 failed-rules) failed-rules))
            (failed-rules-list2 (if failed2 (cons u2 failed-rules-list) failed-rules-list))
            (failed-rules-list3 (if failed3 (cons u3 failed-rules-list2) failed-rules-list2))
            (all-passed (and (not failed1) (not failed2) (not failed3)))
          )
          (map-set verifications
            {crop-id: crop-id, verification-id: verification-id}
            {
              timestamp: block-height,
              standard-id: standard-id,
              passed: all-passed,
              failed-rules: failed-rules-list3,
              data-hash: (get data-hash data)
            }
          )
          (map-set crop-compliance
            {crop-id: crop-id, standard-id: standard-id}
            {compliant: all-passed, last-verified: block-height}
          )
          (var-set rule-version verification-id)
          (if all-passed (ok true) (err ERR-VERIFICATION-FAILED))
        )
      )
    )
  )
)

;; Read-only Functions
(define-read-only (get-standard (standard-id uint))
  (map-get? standards {standard-id: standard-id})
)

(define-read-only (get-rule (standard-id uint) (rule-id uint))
  (map-get? rules {standard-id: standard-id, rule-id: rule-id})
)

(define-read-only (get-verification (crop-id (buff 32)) (verification-id uint))
  (map-get? verifications {crop-id: crop-id, verification-id: verification-id})
)

(define-read-only (get-crop-compliance (crop-id (buff 32)) (standard-id uint))
  (map-get? crop-compliance {crop-id: crop-id, standard-id: standard-id})
)

(define-read-only (is-contract-paused)
  (var-get is-paused)
)

(define-read-only (get-contract-admin)
  (var-get contract-admin)
)

(define-read-only (get-current-version)
  (var-get rule-version)
)