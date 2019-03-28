const LINE_BREAK = '\r\n'
const mime = require('mime-types')
const stringToBuffer = require('./strToBuf')

/*global wx */
const FileSystemManager = wx.getFileSystemManager();

class FormData {

	constructor(config) {
		this.config = config || {};
		this.config.fields = this.config.fields || new Map();
        this.config.files = this.config.files || new Map();
	}

	static fromObj(obj) {
		const form = new FormData();
		Object.keys(obj).forEach((k)=>{
			form.append(k, obj[k]);
        });
        return form;
	}

	append(k, v) {
		if(typeof v !== "string") {
			this.files.append(k ,v);
		} else if(v.startswith("wxfile://")){
			this.files.append(k, {filepath: v});
		} else {
			this.fields.append(k ,v);
		}
	}

	async convertToBuffer() {
		const buffers = new Array();
		const data = new Array();
		const { fields, files } = this;
		
		/* fields */		
		for(let [key, value] of fields) {
			data.push(`${this._getFormDataHeader()}Content-Disposition:form-data;name="${key}"${LINE_BREAK}${LINE_BREAK}`);
			data.push(`${value}${LINE_BREAK}`);
		}

		const fieldbuf = stringToBuffer(data.join(''))
		buffers.push(fieldbuf)
		
		/* files */
		for(let [key, value] of files) {
			let {filepath, filename} = value;
			const contentType = mime.lookup(filepath || filename);
			if (!filename) {
				const matchArr = filepath.match(/(?:(?!\/).)*$/)
				if (!matchArr) {
					filename = '';
				} else {
					filename = matchArr[0];
				}
			}
			let header = `${this._getMultiPartHeader()}Content-Disposition:form-data;name="${key}";filename="${filename}"${LINE_BREAK}`
			header += `Content-Type: ${contentType}${LINE_BREAK}${LINE_BREAK}`
			buffers.push(stringToBuffer(header))

			let fileBuf = await this._getFile(filepath);
			buffers.push(new Uint8Array(fileBuf));
			buffers.push(stringToBuffer(LINE_BREAK));
		}
		/* end */
		buffers.push(stringToBuffer(this._getFormDataFooter()));
		const len = buffers.reduce((prev, cur) => {
			return prev + cur.length;
		}, 0);

		const arrayBuffer = new ArrayBuffer(len);
		const buffer = new Uint8Array(arrayBuffer);
		let sum = 0;
		for (let i = 0; i < buffers.length; i++) {
			for (let j = 0; j < buffers[i].length; j++) {
				buffer[sum + j] = buffers[i][j];
			}
			sum += buffers[i].length;
		}
		return arrayBuffer;
	}

	_getFile(filePath) {
		return new Promise((resolve, reject) => {
			FileSystemManager.readFile({
				filePath,
				success(res) {
					resolve(res.data);
				},
				fail(err) {
					reject(err);
				}
			})
		});
	}

	_getFormDataHeader() {
		return `--------------------------${this.getBoundary()}${LINE_BREAK}`;
    }
    
	_getFormDataFooter() {
		return this._lastBoundary();
	}

    getBoundary() {
        !this._boundary && this._generateBoundary();
        return this._boundary;
    };

    _generateBoundary() {
        this._boundary = `----------------------------${Array.from(Array(24).keys()).map(()=> Math.floor(Math.random() * 10).toString(16)).join('')}`;
    };

    _lastBoundary() {
        return `----------------------------${this.getBoundary()}--${LINE_BREAK}`;
    };
}
module.exports = FormData;
