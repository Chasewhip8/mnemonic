const { TestEnvironment } = require('jest-environment-node')

/**
 * Jest runs tests inside a VM sandbox with its own set of globals.
 * onnxruntime-node returns typed arrays from the main V8 context,
 * causing `instanceof Float32Array` checks in onnxruntime-common to fail.
 * Injecting the real constructors into the sandbox fixes this.
 */
class OnnxCompatibleEnvironment extends TestEnvironment {
	constructor(config, context) {
		super(config, context)
		this.global.Float32Array = Float32Array
		this.global.Float64Array = Float64Array
		this.global.Int32Array = Int32Array
		this.global.Int8Array = Int8Array
		this.global.Uint8Array = Uint8Array
		this.global.Uint16Array = Uint16Array
		this.global.Uint32Array = Uint32Array
		this.global.BigInt64Array = BigInt64Array
		this.global.BigUint64Array = BigUint64Array
		this.global.ArrayBuffer = ArrayBuffer
		this.global.SharedArrayBuffer = SharedArrayBuffer
		this.global.DataView = DataView
	}
}

module.exports = OnnxCompatibleEnvironment
