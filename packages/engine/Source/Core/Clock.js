import ClockRange from "./ClockRange.js";
import ClockStep from "./ClockStep.js";
import defaultValue from "./defaultValue.js";
import defined from "./defined.js";
import DeveloperError from "./DeveloperError.js";
import Event from "./Event.js";
import getTimestamp from "./getTimestamp.js";
import JulianDate from "./JulianDate.js";

/**
 * A simple clock for keeping track of simulated time.
 *
 * @alias Clock
 * @constructor
 *
 * @param {object} [options] Object with the following properties:
 * @param {JulianDate} [options.startTime] The start time of the clock.
 * @param {JulianDate} [options.stopTime] The stop time of the clock.
 * @param {JulianDate} [options.currentTime] The current time.
 * @param {number} [options.multiplier=1.0] Determines how much time advances when {@link Clock#tick} is called, negative values allow for advancing backwards.
 * @param {ClockStep} [options.clockStep=ClockStep.SYSTEM_CLOCK_MULTIPLIER] Determines if calls to {@link Clock#tick} are frame dependent or system clock dependent.
 * @param {ClockRange} [options.clockRange=ClockRange.UNBOUNDED] Determines how the clock should behave when {@link Clock#startTime} or {@link Clock#stopTime} is reached.
 * @param {boolean} [options.canAnimate=true] Indicates whether {@link Clock#tick} can advance time.  This could be false if data is being buffered, for example.  The clock will only tick when both {@link Clock#canAnimate} and {@link Clock#shouldAnimate} are true.
 * @param {boolean} [options.shouldAnimate=false] Indicates whether {@link Clock#tick} should attempt to advance time.  The clock will only tick when both {@link Clock#canAnimate} and {@link Clock#shouldAnimate} are true.
 *
 * @exception {DeveloperError} startTime must come before stopTime.
 *
 *
 * @example
 * // Create a clock that loops on Christmas day 2013 and runs in real-time.
 * const clock = new Cesium.Clock({
 *    startTime : Cesium.JulianDate.fromIso8601("2013-12-25"),
 *    currentTime : Cesium.JulianDate.fromIso8601("2013-12-25"),
 *    stopTime : Cesium.JulianDate.fromIso8601("2013-12-26"),
 *    clockRange : Cesium.ClockRange.LOOP_STOP,
 *    clockStep : Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER
 * });
 *
 * @see ClockStep
 * @see ClockRange
 * @see JulianDate
 */
function Clock(options) {
  // 确保 options 至少是一个空对象，如果没有传入 options，使用一个默认的空对象
  options = defaultValue(options, defaultValue.EMPTY_OBJECT);

  // 从传入的 options 对象中提取时间选项
  let currentTime = options.currentTime;
  let startTime = options.startTime;
  let stopTime = options.stopTime;

  // 确定 currentTime 的值
  if (!defined(currentTime)) {
    // 如果没有指定 currentTime，依次尝试以下设置：
    // 1. 如果 startTime 已定义，则将 currentTime 设置为 startTime
    // 2. 如果 startTime 未定义但 stopTime 已定义，则将 currentTime 设置为 stopTime 的前一天
    // 3. 如果 startTime 和 stopTime 都未定义，则将 currentTime 设置为当前时间
    if (defined(startTime)) {
      currentTime = JulianDate.clone(startTime);
    } else if (defined(stopTime)) {
      currentTime = JulianDate.addDays(stopTime, -1.0, new JulianDate());
    } else {
      currentTime = JulianDate.now();
    }
  } else {
    // 如果 currentTime 已定义，则克隆一份
    currentTime = JulianDate.clone(currentTime);
  }

  // 确定 startTime 的值
  if (!defined(startTime)) {
    // 如果没有指定 startTime，则将其设置为 currentTime（如上所述）
    startTime = JulianDate.clone(currentTime);
  } else {
    // 如果 startTime 已定义，则克隆一份
    startTime = JulianDate.clone(startTime);
  }

  // 确定 stopTime 的值
  if (!defined(stopTime)) {
    // 如果没有指定 stopTime，则将其设置为 startTime 之后的一天（如上所述）
    stopTime = JulianDate.addDays(startTime, 1.0, new JulianDate());
  } else {
    // 如果 stopTime 已定义，则克隆一份
    stopTime = JulianDate.clone(stopTime);
  }

  // 调试时检查 startTime 是否早于 stopTime
  if (JulianDate.greaterThan(startTime, stopTime)) {
    throw new DeveloperError("startTime 必须早于 stopTime。");
  }

  /**
   * 时钟的开始时间。
   * @type {JulianDate}
   */
  this.startTime = startTime;

  /**
   * 时钟的结束时间。
   * @type {JulianDate}
   */
  this.stopTime = stopTime;

  /**
   * 决定时钟在达到 startTime 或 stopTime 时的行为。
   * @type {ClockRange}
   * @default {ClockRange.UNBOUNDED}
   */
  this.clockRange = defaultValue(options.clockRange, ClockRange.UNBOUNDED);

  /**
   * 指示时钟是否可以推进时间。例如，当数据被缓冲时，这可能为 false。
   * 时钟只有在 canAnimate 和 shouldAnimate 都为 true 时才会推进时间。
   * @type {boolean}
   * @default true
   */
  this.canAnimate = defaultValue(options.canAnimate, true);

  /**
   * 每当调用时钟的 tick 方法时触发的事件。
   * @type {Event}
   */
  this.onTick = new Event();

  /**
   * 每当达到 stopTime 时触发的事件。
   * @type {Event}
   */
  this.onStop = new Event();

  // 初始化内部属性
  this._currentTime = undefined;
  this._multiplier = undefined;
  this._clockStep = undefined;
  this._shouldAnimate = undefined;
  this._lastSystemTime = getTimestamp();

  // 使用属性设置器来设置值，以确保值的一致性
  this.currentTime = currentTime;
  this.multiplier = defaultValue(options.multiplier, 1.0);
  this.shouldAnimate = defaultValue(options.shouldAnimate, false);
  this.clockStep = defaultValue(
      options.clockStep,
      ClockStep.SYSTEM_CLOCK_MULTIPLIER
  );
}

Object.defineProperties(Clock.prototype, {
  /**
   * The current time.
   * Changing this property will change
   * {@link Clock#clockStep} from {@link ClockStep.SYSTEM_CLOCK} to
   * {@link ClockStep.SYSTEM_CLOCK_MULTIPLIER}.
   * @memberof Clock.prototype
   * @type {JulianDate}
   */
  currentTime: {
    get: function () {
      return this._currentTime;
    },
    set: function (value) {
      if (JulianDate.equals(this._currentTime, value)) {
        return;
      }

      if (this._clockStep === ClockStep.SYSTEM_CLOCK) {
        this._clockStep = ClockStep.SYSTEM_CLOCK_MULTIPLIER;
      }

      this._currentTime = value;
    },
  },

  /**
   * Gets or sets how much time advances when {@link Clock#tick} is called. Negative values allow for advancing backwards.
   * If {@link Clock#clockStep} is set to {@link ClockStep.TICK_DEPENDENT}, this is the number of seconds to advance.
   * If {@link Clock#clockStep} is set to {@link ClockStep.SYSTEM_CLOCK_MULTIPLIER}, this value is multiplied by the
   * elapsed system time since the last call to {@link Clock#tick}.
   * Changing this property will change
   * {@link Clock#clockStep} from {@link ClockStep.SYSTEM_CLOCK} to
   * {@link ClockStep.SYSTEM_CLOCK_MULTIPLIER}.
   * @memberof Clock.prototype
   * @type {number}
   * @default 1.0
   */
  multiplier: {
    get: function () {
      return this._multiplier;
    },
    set: function (value) {
      if (this._multiplier === value) {
        return;
      }

      if (this._clockStep === ClockStep.SYSTEM_CLOCK) {
        this._clockStep = ClockStep.SYSTEM_CLOCK_MULTIPLIER;
      }

      this._multiplier = value;
    },
  },

  /**
   * Determines if calls to {@link Clock#tick} are frame dependent or system clock dependent.
   * Changing this property to {@link ClockStep.SYSTEM_CLOCK} will set
   * {@link Clock#multiplier} to 1.0, {@link Clock#shouldAnimate} to true, and
   * {@link Clock#currentTime} to the current system clock time.
   * @memberof Clock.prototype
   * @type ClockStep
   * @default {@link ClockStep.SYSTEM_CLOCK_MULTIPLIER}
   */
  clockStep: {
    get: function () {
      return this._clockStep;
    },
    set: function (value) {
      if (value === ClockStep.SYSTEM_CLOCK) {
        this._multiplier = 1.0;
        this._shouldAnimate = true;
        this._currentTime = JulianDate.now();
      }

      this._clockStep = value;
    },
  },

  /**
   * Indicates whether {@link Clock#tick} should attempt to advance time.
   * The clock will only advance time when both
   * {@link Clock#canAnimate} and {@link Clock#shouldAnimate} are true.
   * Changing this property will change
   * {@link Clock#clockStep} from {@link ClockStep.SYSTEM_CLOCK} to
   * {@link ClockStep.SYSTEM_CLOCK_MULTIPLIER}.
   * @memberof Clock.prototype
   * @type {boolean}
   * @default false
   */
  shouldAnimate: {
    get: function () {
      return this._shouldAnimate;
    },
    set: function (value) {
      if (this._shouldAnimate === value) {
        return;
      }

      if (this._clockStep === ClockStep.SYSTEM_CLOCK) {
        this._clockStep = ClockStep.SYSTEM_CLOCK_MULTIPLIER;
      }

      this._shouldAnimate = value;
    },
  },
});

/**
 * Advances the clock from the current time based on the current configuration options.
 * tick should be called every frame, regardless of whether animation is taking place
 * or not.  To control animation, use the {@link Clock#shouldAnimate} property.
 *
 * @returns {JulianDate} The new value of the {@link Clock#currentTime} property.
 */
Clock.prototype.tick = function () {
  const currentSystemTime = getTimestamp();
  let currentTime = JulianDate.clone(this._currentTime);

  if (this.canAnimate && this._shouldAnimate) {
    const clockStep = this._clockStep;
    if (clockStep === ClockStep.SYSTEM_CLOCK) {
      currentTime = JulianDate.now(currentTime);
    } else {
      const multiplier = this._multiplier;

      if (clockStep === ClockStep.TICK_DEPENDENT) {
        currentTime = JulianDate.addSeconds(
          currentTime,
          multiplier,
          currentTime
        );
      } else {
        const milliseconds = currentSystemTime - this._lastSystemTime;
        currentTime = JulianDate.addSeconds(
          currentTime,
          multiplier * (milliseconds / 1000.0),
          currentTime
        );
      }

      const clockRange = this.clockRange;
      const startTime = this.startTime;
      const stopTime = this.stopTime;

      if (clockRange === ClockRange.CLAMPED) {
        if (JulianDate.lessThan(currentTime, startTime)) {
          currentTime = JulianDate.clone(startTime, currentTime);
        } else if (JulianDate.greaterThan(currentTime, stopTime)) {
          currentTime = JulianDate.clone(stopTime, currentTime);
          this.onStop.raiseEvent(this);
        }
      } else if (clockRange === ClockRange.LOOP_STOP) {
        if (JulianDate.lessThan(currentTime, startTime)) {
          currentTime = JulianDate.clone(startTime, currentTime);
        }
        while (JulianDate.greaterThan(currentTime, stopTime)) {
          currentTime = JulianDate.addSeconds(
            startTime,
            JulianDate.secondsDifference(currentTime, stopTime),
            currentTime
          );
          this.onStop.raiseEvent(this);
        }
      }
    }
  }

  this._currentTime = currentTime;
  this._lastSystemTime = currentSystemTime;
  this.onTick.raiseEvent(this);
  return currentTime;
};
export default Clock;
