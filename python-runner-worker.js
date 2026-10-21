/* ЕГЭ+ Python runner: one disposable worker per execution, terminated by the UI timeout. */
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
    const result=await py.runPythonAsync(
      "import sys, io, contextlib, traceback\\n" +
      "sys.stdin = io.StringIO(__ege_stdin)\\n" +
      "class LimitedWriter:\\n" +
      "  def __init__(self, limit=20000): self.parts=[]; self.size=0; self.limit=limit; self.truncated=False\\n" +
      "  def write(self, value):\\n" +
      "    value=str(value); room=self.limit-self.size\\n" +
      "    if room>0: self.parts.append(value[:room]); self.size+=min(len(value),room)\\n" +
      "    if len(value)>room: self.truncated=True\\n" +
      "    return len(value)\\n" +
      "  def flush(self): pass\\n" +
      "  def getvalue(self): return ''.join(self.parts)+('\\\\n… вывод ограничен 20 000 символами …' if self.truncated else '')\\n" +
      "__ege_stdout = LimitedWriter()\\n" +
      "try:\\n" +
      "  with contextlib.redirect_stdout(__ege_stdout):\\n" +
      "    exec(compile(__ege_code, '<ege-submission>', 'exec'), {'__name__':'__main__'})\\n" +
      "  __ege_result = __ege_stdout.getvalue()\\n" +
      "except BaseException as __ege_error:\\n" +
      "  __ege_result = 'Ошибка выполнения: ' + str(__ege_error) + '\\\\n' + traceback.format_exc(limit=2)\\n" +
      "__ege_result"
    );
    self.postMessage({ok:true,output:String(result??'')});
  }catch(error){self.postMessage({ok:false,error:String(error&&error.message||error)});}
};