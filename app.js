const axios = require('axios')
const fs = require('fs')
const FormData = require('form-data');
const mime = require('mime');
const Client = require('ftp');
const client = new Client();

const url = `https://dev.prezentor.com/api/filearchive/sign_s3`;
const access_token = 'eyJraWQiOiIwVk9BSnM0dXY2cGJDalFsUjdiTUc1aWNoUG51M1J1STlWN2ZwNlk2M1pNPSIsImFsZyI6IlJTMjU2In0.eyJvcmlnaW5fanRpIjoiNGNmZTU0OWEtMjBmMS00ODY1LWI4MTQtNTM1Njc1NWFkMGY1Iiwic3ViIjoiMWU2NThiY2YtZWE2Yi00ODM5LWFmN2MtZTQyNjVmMDczMmNmIiwiZXZlbnRfaWQiOiJhZjUzZTU0Zi1jMTg5LTQyNTUtYmE4My03OGZhYTY5NGZjZGEiLCJ0b2tlbl91c2UiOiJhY2Nlc3MiLCJzY29wZSI6ImF3cy5jb2duaXRvLnNpZ25pbi51c2VyLmFkbWluIiwiYXV0aF90aW1lIjoxNjM3NzY1NjA3LCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0xLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMV9ocFNRenFEeWEiLCJleHAiOjE2Mzc5MzQ1ODQsImlhdCI6MTYzNzkzMDk4NCwianRpIjoiYjY5NDAxM2EtZGM0Yi00ZjVmLWEwN2UtYmMzMDMxOTE0NjBhIiwiY2xpZW50X2lkIjoiNjdiNTN2bWhmN2hhcjNidmJzdGNidGhpZ2YiLCJ1c2VybmFtZSI6IjFlNjU4YmNmLWVhNmItNDgzOS1hZjdjLWU0MjY1ZjA3MzJjZiJ9.TkBnm4qXC23LdaNjZdNjyd4vlHnZeAA4w-wy9ClMIE2ZFjLccNPAx_8F4COU8TM7K-nBMIh7FZim43QABqKygJ_htTLHYwyHKowcwEY_RWlIXv1yymwMZTs04mirWlMpn0P1v5Dkv6BPBy-xMC8niqeara6tN1mMsHQUzlaJH669pEzVxa03pCXvAZKeo5PCmS1W6R3nujHAfGfleW17wrC-KGVYgMv8ETOIpHxyZWIkxMi_BcbZv653v_QK5cwxL5lHiCt4oB6WJs69gJPnq0CEtBR1YyMo_Rkn05NkVtFBmpux7wFTsHmpek8lYFbDZtHELvvq_IbZrWiEofGNIg';
const s3Folder = '619d57563d16770007aaabcc';
const clientConnect = {
    host: "192.168.88.180",
    port: 21,
    user: "alimov",
    password: "123456",
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
                        formData.append('AWSAccessKeyId', 'AKIAJRFHUH4JD6KVWEVQ')
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


