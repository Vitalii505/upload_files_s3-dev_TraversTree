const axios = require('axios')
const fs = require('fs')
const FormData = require('form-data');
const mime = require('mime');
const Client = require('ftp');
const client = new Client();

const url = `https://dev.prezentor.com/api/filearchive/sign_s3`;
const access_token = '****...';
const s3Folder = '619d57563d16770007aaabcc';
const clientConnect = {
    host: "***.***.**.***",
    port: 21,
    user: "*****",
    password: "*******",
};

let downloadList = [];

function fileContentType(filename) {
    return mime.getType(`./upload/${filename}`)
};

async function downloadFileFTPserver() {
    client.on('ready', () => {
        client.list('/', async (err, list) => {
            if (err) throw err;
            list.map((entry) => {
                downloadList.push(entry.name);
            });
            downloadList.map((file) => {
                client.get('/' + file, async (err, stream) => {
                    try {
                        if (err) throw err;
                        await stream.once('close', () => {
                            client.end();
                        });
                        await stream.pipe(fs.createWriteStream(`./upload/${file}`));
                    } catch (err) {
                        // console.log(err);
                    }
                });
            });
            await client.end();

            // ЗАГРУЗКА на prezentor
            downloadList.forEach((fileName) => {
                axios
                    .get(url, {
                        params: {
                            s3_object_folder: "staging/presentations/" + s3Folder,
                            s3_object_name: fileName,
                            s3_object_type: fileContentType(fileName)
                        },
                        headers: {
                            "Authorization": "Bearer " + access_token,
                            withCredentials: true,
                        },
                    })
                    .then(( res) => {
                        // console.log(res.data)
                        const formData = new FormData();
                        formData.append('key', `staging/presentations/${s3Folder}${res.data.s3Filename}`)
                        formData.append('AWSAccessKeyId', '*************')
                        formData.append('acl', 'public-read')
                        formData.append('policy', res.data.s3Policy)
                        formData.append('signature', res.data.s3Signature)
                        formData.append('Content-Type', fileContentType(fileName))
                        formData.append('filename', res.data.s3Filename)
                        formData.append('file', fs.readFileSync(`./upload/${fileName}`))

                        axios.create({
                            headers: formData.getHeaders()
                        }).post('https://s3.eu-west-1.amazonaws.com/dev.prezentor.com/', formData, {
                            headers: {
                                'Content-Length': 5000000
                            }
                        })
                            .then(() => {
                                fs.unlink(`./upload/${fileName}`, err => {
                                    if(err){
                                        console.log(err);
                                    }
                                })
                                const objFile = {
                                    hidden: "false",
                                    parent: s3Folder,
                                    title: fileName,
                                    url: `https://cdndev.prezentor.com/staging/presentations/${s3Folder}${res.data.s3Filename}`
                                }
                                axios.post('https://dev.prezentor.com/api/filearchive/', objFile, {
                                    headers: {
                                        "Authorization": "Bearer " + access_token,
                                    }
                                })
                                    .then((res) => {
                                        console.log(res.data);
                                    })
                                    .catch((err) => {
                                        console.log(err);
                                    });
                            })
                            .catch((err) => {
                                console.log(err);
                            });
                    })
                    .catch((err) => {
                        console.log(err);
                    });
            })
        });
    });
    client.connect(clientConnect);
}
downloadFileFTPserver().catch = (err) => {
    console.log(err);
}


