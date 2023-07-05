const axios = require('axios')
const fs = require('fs')
const FormData = require('form-data');
const mime = require('mime');
const Client = require('ftp');
const client = new Client();

const clientConnect = {
    host: "*****",
    port: 21,
    user: "****",
    password: "******",
};
const url = 'https://dev.prezentor.com/api/filearchive/sign_s3';
const access_token = '*****'

function fileContentType(filename) {
    return mime.getType(filename)
};

function postFileArchive(fileName, parent, pathLocal) {
    axios
        .get(url, {
            params: {
                s3_object_folder: "staging/presentations/" + parent,
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
            formData.append('key', `staging/presentations/${parent}${res.data.s3Filename}`)
            formData.append('AWSAccessKeyId', '*********')
            formData.append('acl', 'public-read')
            formData.append('policy', res.data.s3Policy)
            formData.append('signature', res.data.s3Signature)
            formData.append('Content-Type', fileContentType(fileName))
            formData.append('filename', res.data.s3Filename)
            formData.append('file', fs.readFileSync(pathLocal + fileName))

            axios.create({
                headers: formData.getHeaders()
            }).post('https://s3.eu-west-1.amazonaws.com/dev.prezentor.com/', formData, {
                headers: {
                    'Content-Length': 5000000
                }
            })
                .then(() => {
                    const objFile = {
                        hidden: "false",
                        parent: parent,
                        title: fileName,
                        url: `https://cdndev.prezentor.com/staging/presentations/${parent}${res.data.s3Filename}`
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
}


function postUploadFilesTree(folder, pathLocal, parentFolder) {
    let newPathUpload = pathLocal + folder + '/'
    const objFile = {
        hidden: "false",
        name: folder,
        parent: parentFolder,
        type: "folder"
    }
    axios.post('https://dev.prezentor.com/api/filearchive/', objFile, {
        headers: {
            "Authorization": "Bearer " + access_token,
        }
    })
        .then((res) => {
            let folderParent = res.data._id;
            fs.readdir(newPathUpload, function(err, files) {
                files.map((file) => {
                    if (fileContentType(file) !== null) {
                        postFileArchive(file, folderParent, newPathUpload)
                    }
                    else if (fileContentType(file) === null) {
                        return postUploadFilesTree(file, newPathUpload, folderParent);
                    }
                })
            });
        })
        .catch((err) => {
            console.log(err);
        });
}


function setUploadFilesTree(file, pathFtp, pathLocal) {
    let downloadListFolder = [];
    let newPath = pathFtp + file + '/'
    let newPathUpload = pathLocal + file + '/'
    fs.mkdir(newPathUpload,{ recursive: true }, err => {
        if(err) throw err;
    });
    client.list(newPath, async (err, list) => {
        if (err) throw err;
        list.map((entry) => {
            downloadListFolder.push(entry.name);
        });
        downloadListFolder.map((fileNext) => {
            client.get( newPath + fileNext, async (err, stream) => {
                try {
                    if (err) throw err;
                    stream.once('close', () => {
                        client.end();
                    });
                    stream.pipe(fs.createWriteStream(`./upload/${newPath}${fileNext}`));
                } catch (err) {
                }
            });
            if (fileContentType(fileNext) === null) {
                fs.mkdir(newPathUpload + fileNext + '/', { recursive: true }, err => {
                    if(err) throw err; // создание папки
                });
                return setUploadFilesTree(fileNext, newPath, newPathUpload)
            }
        });
        client.end();
        })
}


async function downloadFileFTPserver() {
    let downloadList = [];
    let pathFtp = '/';
    let pathLocal = './upload/';
    const s3Parent = '*****d57563d16770007a*****';
    client.on('ready', () => {
        client.list(pathFtp, async (err, list) => {
            if (err) throw err;
            list.map((entry) => {
                downloadList.push(entry.name);
            });
            // !!
            downloadList.map((file) => {
                if (fileContentType(file) === null) {
                    setUploadFilesTree(file, pathFtp, pathLocal)
                } else {
                    client.get('/' + file, async (err, stream) => {
                        try {
                            if (err) throw err;
                            await stream.once('close', () => {
                                client.end();
                            });
                            await stream.pipe(fs.createWriteStream(`${pathLocal}${file}`));
                        } catch (err) {
                        }
                    });
                }
            });
            await client.end();
            // ЗАГРУЗКА на prezentor
            setTimeout(()=> {
                fs.readdir(pathLocal, function (err, files) {
                files.map((fileName) => {
                    if (fileContentType(fileName) === null) {
                        postUploadFilesTree(fileName, pathLocal, s3Parent)
                    } else if (fileContentType(fileName) !== null) {
                        postFileArchive(fileName, s3Parent, pathLocal)
                    }
                })
                });
            }, 500)
    });
});
client.connect(clientConnect);
}
downloadFileFTPserver().catch = (err) => {
    console.log(err);
}



