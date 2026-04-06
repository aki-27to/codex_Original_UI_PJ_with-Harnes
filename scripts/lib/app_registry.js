"use strict";

const fs=require("fs");
const path=require("path");

function safeString(value,max=400){
  if(typeof value!=="string")return"";
  const trimmed=value.trim();
  if(!trimmed)return"";
  return trimmed.slice(0,max);
}

function toPosixPath(value){
  return safeString(value,2000).replace(/\\/g,"/");
}

function resolvePathFromWorkspace(workspaceRoot,value){
  const relative=toPosixPath(value);
  if(!relative)return"";
  return path.resolve(workspaceRoot,relative);
}

function isPathWithin(root,target){
  const normalizedRoot=path.resolve(root);
  const normalizedTarget=path.resolve(target);
  if(process.platform==="win32"){
    const lowerRoot=normalizedRoot.toLowerCase();
    const lowerTarget=normalizedTarget.toLowerCase();
    return lowerTarget===lowerRoot||lowerTarget.startsWith(`${lowerRoot}${path.sep}`);
  }
  return normalizedTarget===normalizedRoot||normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

function normalizeMountPath(value){
  const raw=safeString(value,240);
  if(!raw)return"";
  const normalized=`/${raw.replace(/^\/+/,"").replace(/\/+$/,"")}`;
  return normalized==="/"?normalized:normalized.replace(/\/{2,}/g,"/");
}

function normalizeIntegrationMode(value){
  const mode=safeString(value,80).toLowerCase();
  if(mode==="native-static"||mode==="reverse-proxy")return mode;
  return"native-static";
}

function normalizeProxyConfig(proxy){
  const source=proxy&&typeof proxy==="object"?proxy:{};
  return{
    baseUrlEnvKey:safeString(source.baseUrlEnvKey,120),
    defaultBaseUrl:safeString(source.defaultBaseUrl,240),
    healthPath:normalizeMountPath(source.healthPath||"/healthz"),
    stripMountPath:source.stripMountPath!==false,
  };
}

function normalizeStaticConfig(staticConfig){
  const source=staticConfig&&typeof staticConfig==="object"?staticConfig:{};
  return{
    envKey:safeString(source.envKey,120),
    indexFile:safeString(source.indexFile,120)||"index.html",
    bundledRelativeRoot:toPosixPath(source.bundledRelativeRoot),
    candidateRelativeRoots:Array.isArray(source.candidateRelativeRoots)
      ?source.candidateRelativeRoots.map((item)=>toPosixPath(item)).filter(Boolean)
      :[],
  };
}

function loadAppRegistry(workspaceRoot){
  const appRoot=path.join(workspaceRoot,"APP");
  const entries=[];
  if(!fs.existsSync(appRoot))return entries;
  for(const dirent of fs.readdirSync(appRoot,{withFileTypes:true})){
    if(!dirent.isDirectory())continue;
    const manifestPath=path.join(appRoot,dirent.name,"app.manifest.json");
    if(!fs.existsSync(manifestPath))continue;
    try{
      const payload=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
      const mountPath=normalizeMountPath(payload.mountPath);
      const id=safeString(payload.id,120).toLowerCase();
      if(!id||!mountPath)continue;
      entries.push({
        schema:safeString(payload.schema,120)||"harness-app-manifest.v1",
        id,
        order:Number.isFinite(Number(payload.order))?Math.max(0,Math.trunc(Number(payload.order))):999,
        title:safeString(payload.title,160)||id,
        description:safeString(payload.description,400),
        mountPath,
        legacyMountPath:normalizeMountPath(payload.legacyMountPath),
        integrationMode:normalizeIntegrationMode(payload.integrationMode),
        workingDirectory:resolvePathFromWorkspace(workspaceRoot,payload.workingDirectory),
        nativeApiPrefix:normalizeMountPath(payload.nativeApiPrefix),
        proxy:normalizeProxyConfig(payload.proxy),
        static:normalizeStaticConfig(payload.static),
        manifestPath,
      });
    }catch{
    }
  }
  return entries.sort((left,right)=>left.order-right.order||left.id.localeCompare(right.id));
}

function resolveExistingStaticDirectory(candidate,{indexFile="index.html"}={}){
  const root=safeString(candidate,2000);
  if(!root)return null;
  try{
    const stat=fs.statSync(root);
    if(!stat.isDirectory())return null;
    if(!indexFile)return root;
    const indexStat=fs.statSync(path.join(root,indexFile));
    return indexStat.isFile()?root:null;
  }catch{
    return null;
  }
}

function resolveNativeStaticRoot(app,workspaceRoot){
  if(!app||app.integrationMode!=="native-static")return null;
  const staticConfig=app.static||{};
  const candidates=[];
  if(staticConfig.envKey){
    const override=safeString(process.env[staticConfig.envKey],2000);
    if(override){
      const resolvedOverride=path.resolve(override);
      candidates.push(resolvedOverride);
      candidates.push(path.join(resolvedOverride,"dist"));
      candidates.push(path.join(resolvedOverride,"web",app.id));
    }
  }
  for(const relativeRoot of staticConfig.candidateRelativeRoots||[]){
    candidates.push(resolvePathFromWorkspace(workspaceRoot,relativeRoot));
  }
  if(staticConfig.bundledRelativeRoot){
    candidates.push(resolvePathFromWorkspace(workspaceRoot,staticConfig.bundledRelativeRoot));
  }
  for(const candidate of candidates){
    const resolved=resolveExistingStaticDirectory(candidate,{indexFile:staticConfig.indexFile});
    if(resolved){
      return{
        root:resolved,
        source:candidate===resolvePathFromWorkspace(workspaceRoot,staticConfig.bundledRelativeRoot)
          ?"workspace-bundled"
          :"configured",
        envKey:staticConfig.envKey||"",
      };
    }
  }
  return null;
}

function buildAppsRuntimeSnapshot(apps,workspaceRoot){
  return apps.map((app)=>{
    const base={
      id:app.id,
      title:app.title,
      description:app.description,
      order:app.order,
      mountPath:app.mountPath,
      legacyMountPath:app.legacyMountPath||"",
      integrationMode:app.integrationMode,
      workingDirectory:app.workingDirectory&&isPathWithin(path.dirname(workspaceRoot),app.workingDirectory)
        ?app.workingDirectory
        :"",
      manifestPath:app.manifestPath,
    };
    if(app.integrationMode==="native-static"){
      const staticRoot=resolveNativeStaticRoot(app,workspaceRoot);
      return{
        ...base,
        static:{
          root:staticRoot&&staticRoot.root?staticRoot.root:"",
          source:staticRoot&&staticRoot.source?staticRoot.source:"missing",
          envKey:app.static&&app.static.envKey?app.static.envKey:"",
        },
      };
    }
    return{
      ...base,
      proxy:{
        baseUrlEnvKey:app.proxy&&app.proxy.baseUrlEnvKey?app.proxy.baseUrlEnvKey:"",
        defaultBaseUrl:app.proxy&&app.proxy.defaultBaseUrl?app.proxy.defaultBaseUrl:"",
        healthPath:app.proxy&&app.proxy.healthPath?app.proxy.healthPath:"/healthz",
      },
    };
  });
}

function findAppById(apps,appId){
  const normalized=safeString(appId,120).toLowerCase();
  if(!normalized)return null;
  return apps.find((app)=>app.id===normalized)||null;
}

function findAppByMountPath(apps,pathname){
  const normalized=normalizeMountPath(pathname);
  if(!normalized)return null;
  return apps.find((app)=>normalized===app.mountPath||normalized.startsWith(`${app.mountPath}/`))||null;
}

function rewriteNativeAppApiPath(apps,pathname){
  const raw=safeString(pathname,1000);
  if(!raw)return"";
  for(const app of apps){
    if(app.integrationMode!=="native-static"||!app.nativeApiPrefix)continue;
    const apiMount=`${app.mountPath}/api`;
    if(raw===apiMount)return app.nativeApiPrefix;
    if(raw.startsWith(`${apiMount}/`)){
      const suffix=raw.slice(apiMount.length);
      return `${app.nativeApiPrefix}${suffix}`;
    }
  }
  return"";
}

function resolveProxyAppForward(apps,pathname){
  const raw=safeString(pathname,1000);
  if(!raw)return null;
  for(const app of apps){
    if(app.integrationMode!=="reverse-proxy")continue;
    if(raw===app.mountPath||raw.startsWith(`${app.mountPath}/`)){
      const proxyConfig=app.proxy||{};
      const baseUrl=proxyConfig.baseUrlEnvKey
        ?safeString(process.env[proxyConfig.baseUrlEnvKey],240)||safeString(proxyConfig.defaultBaseUrl,240)
        :safeString(proxyConfig.defaultBaseUrl,240);
      if(!baseUrl)return null;
      const suffix=proxyConfig.stripMountPath!==false
        ?raw.slice(app.mountPath.length)||"/"
        :raw;
      return{
        app,
        baseUrl,
        targetPath:suffix.startsWith("/")?suffix:`/${suffix}`,
      };
    }
  }
  return null;
}

module.exports={
  buildAppsRuntimeSnapshot,
  findAppById,
  findAppByMountPath,
  isPathWithin,
  loadAppRegistry,
  normalizeMountPath,
  resolveNativeStaticRoot,
  resolveProxyAppForward,
  rewriteNativeAppApiPath,
};
