/* ЕГЭ+ Python runner: each run lives in a disposable worker. */
importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');
let pyodidePromise;
async function getPython(){
  if(!pyodidePromise) pyodidePromise=loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});
  return pyodidePromise;
}
self.onmessage=async event=>{
  const {code,stdin}=event.data||{};
  try{
    const py=await getPython();
    self.postMessage({ready:true});
    py.globals.set('__ege_stdin',String(stdin??''));
    py.globals.set('__ege_code',String(code??''));
    const pythonSource=[
      'import sys, io, contextlib, traceback',
      'sys.stdin = io.StringIO(__ege_stdin)',
      'class LimitedWriter:',
      '    def __init__(self, limit=20000): self.parts=[]; self.size=0; self.limit=limit; self.truncated=False',
      '    def write(self, value):',
      '        value=str(value); room=self.limit-self.size',
      '        if room>0: self.parts.append(value[:room]); self.size+=min(len(value),room)',
      '        if len(value)>room: self.truncated=True',
      '        return len(value)',
      '    def flush(self): pass',
      '    def getvalue(self): return "".join(self.parts)+("\\n… вывод ограничен 20 000 символами …" if self.truncated else "")',
      '__ege_stdout = LimitedWriter()',
      'try:',
      '    with contextlib.redirect_stdout(__ege_stdout):',
      '        exec(compile(__ege_code, "<ege-submission>", "exec"), {"__name__":"__main__"})',
      '    __ege_result = __ege_stdout.getvalue()',
      'except BaseException as __ege_error:',
      '    __ege_result = "Ошибка выполнения: " + str(__ege_error) + "\\n" + traceback.format_exc(limit=2)',
      '__ege_result'
    ].join('\\n');
    const result=await py.runPythonAsync(pythonSource);
    self.postMessage({ok:true,output:String(result??'')});
  }catch(error){self.postMessage({ok:false,error:String(error&&error.message||error)});}
};