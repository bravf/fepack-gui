let fs = require('fs')
let path = require('path')
let exec = require('child_process').exec
let spawn = require('child_process').spawn
let remote = require('electron').remote
let dialog = remote.dialog

// {
//     '/Users/bravf/code/mljr/yyfq-h5'： {
//         name: 'yyfq-h5',
//         currEnv: 'null/dev/qa/www',
//         path: '/Users/bravf/code/mljr/yyfq-h5'
//     }
// }

// 预先kill掉所有fepack,fedog相关的进程，防止冲突
exec("ps aux | grep -E 'fepack server|fedog server|fepack release|fedog release|__fepack-tmp|__fedog-tmp' | grep -v grep | awk '{print $2}' | xargs kill -9")

// 读取配置文件
let confPath = path.join(process.env.HOME, '.fepackrc')

function newConf(){
    return []
}

function readConf(){
    if (!fs.existsSync(confPath)){
        return newConf()
    }
    else{
        try{
            return JSON.parse(fs.readFileSync(confPath))
        }
        catch (ex){
            return newConf()
        }
    }
}

function writeConf(conf){
    fs.writeFileSync(confPath, JSON.stringify(conf))
}

// vue操作
let vueVM = new Vue({
    el: '#app',
    data: {
        projects: readConf(),
        currProject: null,
        envs: ['dev','qa','www'],
        projectId: 0
    },
    watch: {
        projects: function (){
            writeConf(this.projects)
        }
    },
    methods: {
        addProject: function (){
            let me = this

            dialog.showOpenDialog({
                properties: ['openDirectory', 'multiSelections']
            }, 
            function (paths){
                paths.forEach(_=>{
                    if (!(_ in me.projects)){
                        me.projects[_] = true
                        vueVM.projects.push(
                            {
                                gid: me.projectId++,
                                name: path.basename(_),
                                path: _,
                                currEnv: '',
                                execObj: null,
                                serverExecObj: null,
                                logmsg: [],
                                errmsg: []
                            }
                        )    
                    }
                })
            })
            
        },
        removeProject: function (){
            let project = this.currProject
            for (let i=0; i<this.projects.length; i++){
                if (project.path == this.projects[i].path){
                    this.projects.splice(i, 1)
                    return
                }
            }
        },
        clearLogMsg: function (project){
            project.logmsg = []
        },
        clearErrMsg: function (project){
            project.errmsg = []
        },
        setCurrProject: function (project){
            this.currProject = project
            process.chdir(project.path)
        },
        runProject: function (project, env){
            let me = this

            if (project.execObj){
                if (window.confirm('当前项目正在构建，确认结束本次构建？')){
                    process.kill(-project.execObj.pid)
                }
                return false
            }

            project.currEnv = env
            project.logmsg = []
            project.errmsg = []

            let execObj = project.execObj = spawn('python', ['run.py', `${env}`], {detached:true})
            execObj.stdout.on('data', msg=>{
                msg.toString().split('\n').forEach(_=>{
                    if(_.trim().length == 0){
                        return false
                    }
                    if (/error/i.test(_)){
                        me.setLog(project, 'errmsg', _)
                    }
                    else {
                        me.setLog(project, 'logmsg', _)
                    }
                })
            })

            execObj.stderr.on('data', msg=>{
                msg.toString().split('\n').forEach(_=>{
                    if(_.trim().length == 0){
                        return false
                    }
                    me.setLog(project, 'errmsg', _)
                })
            })

            execObj.on('exit', function (){
                project.execObj = null
                me.setLog(project, 'logmsg', '本次构建已经关闭')
            })
        },
        runServer: function (project){
            let me = this

            //检测是否已经运行
            if (project.serverExecObj){
                if (window.confirm('当前项目server正在运行，确认关闭？')){
                    process.kill(-project.serverExecObj.pid)
                }
                return
            }

            let execObj = project.serverExecObj = spawn('python', ['run.py'], {detached:true})
            
            execObj.stdout.on('data', msg=>{
                msg.toString().split('\n').forEach(_=>{
                    if(_.trim().length == 0){
                        return false
                    }
                    if (/error/i.test(_)){
                        me.setLog(project, 'errmsg', _)
                    }
                    else {
                        me.setLog(project, 'logmsg', _)
                    }
                })
            })

            execObj.stderr.on('data', msg=>{
                msg.toString().split('\n').forEach(_=>{
                    if(_.trim().length == 0){
                        return false
                    }
                    project.errmsg.push(_)
                })
            })

            execObj.on('exit', function (){
                console.log('进程已经退出')
                project.serverExecObj = null 
                me.setLog(project, 'logmsg', '当前server已经关闭!')
            })
        },
        setLog: function (project, logType, msg){
            project[logType].push(msg)
            this.scrollLog(`${project.gid}_console`, logType)
        },
        scrollLog: function (selector, logType){
            let $el = document.getElementById(selector)

            if (logType == 'logmsg'){
                $el = $el.querySelector('.msg')
            }
            else {
                $el = $el.querySelector('.errmsg')
            }

            setTimeout(function (){
                $el.scrollTop = 1e10
            }, 10)
        },
        clearCache: function (){
            exec('fepack server clean')
            exec('fedog server clean')
        }
    }
})