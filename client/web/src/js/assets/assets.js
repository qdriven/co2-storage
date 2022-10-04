import language from '@/src/mixins/i18n/language.js'
import copyToClipboard from '@/src/mixins/clipboard/copy-to-clipboard.js'
import updateForm from '@/src/mixins/form-elements/update-form.js'
import syncFormFiles from '@/src/mixins/form-elements/sync-form-files.js'
import humanReadableFileSize from '@/src/mixins/file/human-readable-file-size.js'
import navigate from '@/src/mixins/router/navigate.js'

import Header from '@/src/components/helpers/Header.vue'
import FormElements from '@/src/components/helpers/FormElements.vue'
import LoadingBlocker from '@/src/components/helpers/LoadingBlocker.vue'

import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import {FilterMatchMode,FilterService} from 'primevue/api'
import Toast from 'primevue/toast'
import Tooltip from 'primevue/tooltip'

import { EstuaryStorage } from '@co2-storage/js-api'

const created = function() {
	const that = this
	
	// set language
	this.setLanguage(this.$route)

	// init Estuary storage
	if(this.estuaryStorage == null)
		this.$store.dispatch('main/setEstuaryStorage', new EstuaryStorage(this.co2StorageAuthType))
}

const computed = {
	templatesClass() {
		return this.theme + '-templates-' + this.themeVariety
	},
	locale() {
		return this.$store.getters['main/getLocale']
	},
	theme() {
		return this.$store.getters['main/getTheme']
	},
	themeVariety() {
		return this.$store.getters['main/getThemeVariety']
	},
	walletChain() {
		return this.$store.getters['main/getWalletChain']
	},
	co2StorageAuthType() {
		return this.$store.getters['main/getCO2StorageAuthType']
	},
	estuaryStorage() {
		return this.$store.getters['main/getEstuaryStorage']
	},
	ipldExplorerUrl() {
		return this.$store.getters['main/getIpldExplorerUrl']
	}
}

const watch = {
	walletError: {
		handler() {
			if(this.walletError != null) {
				this.$toast.add({severity: 'error', summary: this.$t('message.shared.error'), detail: this.walletError, life: 3000})
				this.selectedAddress = null
			}
		},
		deep: true,
		immediate: false
	},
	async selectedAddress() {
		if(this.selectedAddress == null) {
			this.$router.push({ path: '/' })
			return
		}
	},
	json: {
		handler(state, before) {
			if(state)
				this.updateForm()
			
			// If schema content is deleted reset schema
			if(this.json && Object.keys(this.json).length === 0 && Object.getPrototypeOf(this.json) === Object.prototype)
				this.template = null
		},
		deep: true,
		immediate: false
	},
	async assetBlockCid() {
		if(this.assetBlockCid != undefined)
			await this.getAsset(this.assetBlockCid)
	}
}

const mounted = async function() {
	await this.getTemplates()

	const routeParams = this.$route.params
	if(routeParams['cid'])
		this.assetBlockCid = routeParams['cid']
}

const methods = {
	// Retrieve templates
	async getTemplates() {
		let getTemplatesResponse, skip = 0, limit = 10
		try {
			do {
				getTemplatesResponse = await this.estuaryStorage.getTemplates(skip, limit)
				this.templates = this.templates.concat(getTemplatesResponse.result.list)
				skip = getTemplatesResponse.result.skip
				limit = getTemplatesResponse.result.limit
				skip += limit
			} while (getTemplatesResponse.result.length)
		} catch (error) {
			console.log(error)
		}
	
		this.templatesLoading = false
	},
	async setTemplate(row, keepAssetCid) {
		const template = row.data.template
		const templateBlock = row.data.templateBlock
		const templateBlockCid = row.data.block

		this.json = JSON.parse(JSON.stringify(template))

		if(!this.assetName || !this.assetName.length || !keepAssetCid)
			this.assetName = this.$t('message.assets.generic-asset-name', {template: templateBlock.name, wallet: this.selectedAddress})
		this.template = templateBlockCid

		if(!keepAssetCid)
			this.assetBlockCid = null
	},
	async addAsset() {
		const that = this
		this.loadingMessage = this.$t('message.assets.creating-asset')
		this.loading = true
		const addAssetResponse = await this.estuaryStorage.addAsset(this.formElements,
			{
				parent: this.assetParent,
				name: this.assetName,
				template: this.template,
				filesUploadStart: () => {
					that.loadingMessage = that.$t('message.assets.adding-images-and-documents-to-ipfs')
					that.loading = true
				},
				filesUpload: async (bytes, path) => {
					that.loadingMessage = `${that.$t('message.assets.adding-images-and-documents-to-ipfs')} - (${that.humanReadableFileSize(bytes)})`
				},
				filesUploadEnd: () => {
					that.loading = false
				},
				createAssetStart: () => {
					that.loadingMessage = that.$t('message.assets.creating-asset')
					that.loading = true
				},
				createAssetEnd: () => {
					that.loading = false
				}
			}
		)
		this.loading = false

		this.assetBlockCid = addAssetResponse.result.block
		this.$toast.add({severity:'success', summary: this.$t('message.shared.created'), detail: this.$t('message.assets.asset-created'), life: 3000})
	},
	async getAsset(assetBlockCid) {
		this.loadingMessage = this.$t('message.assets.loading-asset')
		this.loading = true

		let getAssetResponse
		try {
			getAssetResponse = await this.estuaryStorage.getAsset(assetBlockCid)
		} catch (error) {
			console.log(error)			
		}

		this.loading = false

		const asset = getAssetResponse.result.asset
		const assetBlock = getAssetResponse.result.assetBlock

		const templateBlockCid = getAssetResponse.result.assetBlock.template
		this.loadingMessage = this.$t('message.schemas.loading-schema')
		this.loading = true

		let getTemplateResponse
		try {
			getTemplateResponse = await this.estuaryStorage.getTemplate(templateBlockCid)
		} catch (error) {
			console.log(error)			
		}

		this.loading = false

		await this.setTemplate({"data": getTemplateResponse.result})

		this.assetName = assetBlock.name

		this.loadingMessage = this.$t('message.assets.loading-asset')
		this.loading = true
		for await (let element of this.formElements) {
			const key = element.name

			const keys = asset.data.map((a) => {return Object.keys(a)[0]})
			const valIndex = keys.indexOf(key)
			if(valIndex == -1)
				continue
			
			if(element.type == 'Images' || element.type == 'Documents') {
				element.value = []
				const dfiles = asset.data[valIndex][key]
				if(dfiles != null)
					for await (const dfile of dfiles) {
						this.loadingMessage = this.$t('message.shared.loading-something', {something: dfile.path})
						let buffer = await this.estuaryStorage.getRawData(dfile.cid)
						element.value.push({
							path: dfile.path,
							content: buffer,
							existing: true,
							cid: dfile.cid
						})
					}
			}
			else {
				this.loadingMessage = this.$t('message.shared.loading-something', {something: key})
				element.value = asset.data[valIndex][key]
			}
		}
		this.loading = false
		this.loadingMessage = ''
	},
	filesUploader(event) {
	},
	filesSelected(sync) {
		this.syncFormFiles(sync)
	},
	filesRemoved(sync) {
		this.syncFormFiles(sync)
	},
	fileRemoved(sync) {
		this.syncFormFiles(sync)
	},
	filesError(sync) {
	}
}

const destroyed = function() {
}

export default {
	mixins: [
		language,
		copyToClipboard,
		updateForm,
		syncFormFiles,
		humanReadableFileSize,
		navigate
	],
	components: {
		Header,
		FormElements,
		LoadingBlocker,
		InputText,
		Button,
		Toast,
		DataTable,
		Column
	},
	directives: {
		Tooltip
	},
	name: 'Assets',
	data () {
		return {
			selectedAddress: null,
			walletError: null,
			json: null,
			formElements: [],
			templates: [],
			templatesFilters: {
				'creator': {value: null, matchMode: FilterMatchMode.CONTAINS},
				'cid': {value: null, matchMode: FilterMatchMode.CONTAINS},
				'name': {value: null, matchMode: FilterMatchMode.CONTAINS},
				'base': {value: null, matchMode: FilterMatchMode.CONTAINS}
			},
			templatesMatchModeOptions: [
				{label: 'Contains', value: FilterMatchMode.CONTAINS},
				{label: 'Contains', value: FilterMatchMode.CONTAINS},
				{label: 'Contains', value: FilterMatchMode.CONTAINS},
				{label: 'Contains', value: FilterMatchMode.CONTAINS}
			],
			templatesLoading: true,
			template: null,
			assetName: '',
			ipfs: null,
			wallets: {},
			assetBlockCid: null,
			assetParent: null,
			loading: false,
			loadingMessage: ''
		}
	},
	created: created,
	computed: computed,
	watch: watch,
	mounted: mounted,
	methods: methods,
	destroyed: destroyed
}
