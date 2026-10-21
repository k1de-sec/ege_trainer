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
    py.globals.set('__ege_stdin',String(stdin??''));
    py.globals.set('__ege_code',String(code??''));
    const result=await py.runPythonAsync(
      "import sys, io, contextlib, traceback\n" +
      "sys.stdin = io.StringIO(__ege_stdin)\n" +
      "__ege_stdout = io.StringIO()\n" +
      "try:\n" +
      "  with contextlib.redirect_stdout(__ege_stdout):\n" +
      "    exec(compile(__ege_code, '<ege-submission>', 'exec'), {'__name__':'__main__'})\n" +
      "  __ege_result = __ege_stdout.getvalue()\n" +
      "except BaseException as __ege_error:\n" +
      "  __ege_result = 'Ошибка выполнения: ' + str(__ege_error) + '\\n' + traceback.format_exc(limit=2)\n" +
      "__ege_result"
    );
    self.postMessage({ok:true,output:String(result??'')});
  }catch(error){self.postMessage({ok:false,error:String(error&&error.message||error)});}
};