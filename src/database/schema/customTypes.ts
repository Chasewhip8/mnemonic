import { customType } from 'drizzle-orm/sqlite-core'

export const f32Blob = customType<{ data: number[] | null; driverData: null }>({
	dataType() {
		return 'F32_BLOB(384)'
	},
})
