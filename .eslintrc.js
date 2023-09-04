const config = {
	// ...other ESLint configurations
	rules: {
		// ...other rules
		'@typescript-eslint/naming-convention': [
			'error',
			{
				selector: 'property',
				format: ['strictCamelCase', 'snake_case'],
			},
		],
	},
}

export default config
