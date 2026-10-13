import json, random, math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'tasks_data.json'
data = json.loads(DATA.read_text(encoding='utf-8'))
base_tasks = {int(t['taskNumber']): t for t in data if t.get('subjectId') == 'math_basic' and ('_practice_' in t.get('externalId','') or (t.get('sourceType') == 'author_original' and int(t.get('variantIndex', 1)) == 1))}
assert len(base_tasks) == 21, f'expected 21 original basics, got {len(base_tasks)}'

SOURCE_NOTE = "\n\n**Источник:** авторская тренировочная задача, созданная по теме базового ЕГЭ. Это не официальный вопрос ФИПИ. Официальные материалы доступны в разделе «Источники ФИПИ» на странице тренажёра."

def fmt_decimal(n):
    if isinstance(n, float) and n.is_integer(): return str(int(n))
    if isinstance(n, float): return f'{n:.4f}'.rstrip('0').rstrip('.').replace('.', ',')
    return str(n)

def variant_for(n, v, b):
    rng = random.Random(20271000 + n*100 + v*7)
    title0, typ = b['title'], b['taskType']
    mistakes = b.get('commonMistakes') or ['Внимательно проверь арифметические действия и единицы измерения.']
    keywords = list(dict.fromkeys((b.get('keywords') or []) + ['вариант', 'тренировка']))
    diff = 1 + (v % 3 == 0)
    statement = ''
    answer = None
    explanation = ''
    if n == 1:
        need = rng.randint(51, 175); pack = rng.choice([8, 10, 12, 15, 16, 20, 24])
        answer = math.ceil(need/pack)
        statement = f'Для школьного проекта нужно {need} одинаковых листов бумаги. В одной пачке {pack} листов. Какое наименьшее количество пачек нужно купить?'
        explanation = f'Разделим количество листов на размер пачки: {need}/{pack} = {need/pack:.3f}… Пачек должно хватить целиком, поэтому округляем вверх. Нужно **{answer} пачек**.'
    elif n == 2:
        cats = [('масса взрослой кошки', rng.choice(['3,5 кг','4 кг','4,5 кг'])), ('объём большой бутылки воды', rng.choice(['1,5 л','2 л'])), ('высота межкомнатной двери', rng.choice(['2 м','2,1 м'])), ('толщина монеты', rng.choice(['2 мм','1,5 мм']))]
        values = [x[1] for x in cats]; rng.shuffle(values)
        # Number the shuffled values and map each quantity to its number.
        options = {str(i+1): values[i] for i in range(4)}
        correct = [str(next(int(k) for k,val in options.items() if val == expected)) for _, expected in cats]
        # A value may duplicate in rare picks; force distinct plausible values.
        cats = [('масса взрослой кошки','4 кг'), ('объём большой бутылки воды','1,5 л'), ('высота межкомнатной двери','2 м'), ('толщина монеты','2 мм')]
        values = [x[1] for x in cats]; rng.shuffle(values)
        options = {str(i+1): values[i] for i in range(4)}
        correct = [str(next(k for k,val in options.items() if val == expected)) for _, expected in cats]
        answer = ''.join(correct)
        labels = ['А','Б','В','Г']
        statement = 'Установите соответствие между величинами и их возможными значениями.\n\n**Величины**\n' + '\n'.join(f'{labels[i]}) {name}' for i,(name,_) in enumerate(cats)) + '\n\n**Значения**\n' + '\n'.join(f'{k}) {val}' for k,val in options.items()) + '\n\nЗапишите четыре цифры подряд в порядке А, Б, В, Г.'
        explanation = 'Сопоставим реалистичные значения: масса кошки — 4 кг, объём бутылки — 1,5 л, высота двери — 2 м, толщина монеты — 2 мм. По списку значений получаем код **' + answer + '**.'
    elif n == 3:
        vals = [rng.randint(25, 95) for _ in range(5)]; vals[rng.randrange(5)] = max(vals)+rng.randint(1,8)
        answer = max(vals)
        days = ['Пн','Вт','Ср','Чт','Пт']
        statement = 'В таблице указано количество билетов, проданных за пять дней.\n\n| День | ' + ' | '.join(days) + ' |\n|---|' + '|'.join('---:' for _ in days) + '|\n| Билеты | ' + ' | '.join(map(str,vals)) + ' |\n\nСколько билетов продали в день с наибольшим количеством продаж?'
        explanation = 'Сравним все значения таблицы: ' + ', '.join(map(str,vals)) + '. Наибольшее значение — **' + str(answer) + '**.'
    elif n == 4:
        speed = rng.choice([36, 40, 48, 54, 60, 64, 72, 80, 90]); hours = rng.choice([1.5,2,2.5,3,4])
        answer = int(speed*hours) if (speed*hours).is_integer() else speed*hours
        statement = f'Расстояние при равномерном движении вычисляется по формуле \\(S=vt\\), где \\(v\\) — скорость, а \\(t\\) — время. Найдите расстояние, если скорость равна {speed} км/ч, а время — {fmt_decimal(hours)} ч.'
        explanation = f'Подставим значения в формулу: \\(S={speed}\\cdot {fmt_decimal(hours)}={fmt_decimal(answer)}\\). **Ответ: {fmt_decimal(answer)} км.**'
    elif n == 5:
        ratios = [(1,5),(1,4),(3,10),(2,5),(3,4),(7,10),(3,5),(9,20)]
        num, den = rng.choice(ratios); total = rng.choice([20,40,50,100])
        good = total // den * num if total % den == 0 else None
        if good is None: total = den* rng.randint(2,8); good=total//den*num
        colors = ['красных','синих','зелёных']; target = rng.choice(colors)
        counts = {c:rng.randint(5,18) for c in colors}
        counts[target] = good if good > 0 else 1
        # Keep the intended ratio exact by rescaling total composition.
        total = counts[target] * den // num
        counts['остальных'] = total-counts[target]
        answer = round(counts[target]/total, 4)
        color_instrumental = {'красных':'красным','синих':'синим','зелёных':'зелёным'}[target]
        statement = f'В коробке лежат {counts[target]} {target} жетонов и {counts["остальных"]} жетонов других цветов. Наугад достают один жетон. Найдите вероятность того, что он окажется {color_instrumental} жетоном. Ответ запишите десятичной дробью.'
        explanation = f'Всего жетонов \\({counts[target]}+{counts["остальных"]}={total}\\). Искомая вероятность равна отношению числа подходящих жетонов к общему числу: \\({counts[target]}/{total}={fmt_decimal(answer)}\\).'
    elif n == 6:
        q = rng.randint(5,12)
        ap, ad = rng.randint(45,95), rng.choice([100,150,180,200])
        bp, bd, threshold = rng.randint(50,100), rng.choice([0,80,120]), rng.randint(400,700)
        cp, cd = rng.randint(48,105), rng.choice([0,50,90,120])
        costA=q*ap+ad; costB=q*bp+(0 if q*bp>threshold else bd); costC=q*cp+cd
        answer=min(costA,costB,costC)
        statement = f'Нужно купить {q} одинаковых тетрадей.\n\n| Магазин | Цена одной тетради | Доставка |\n|---|---:|---|\n| А | {ap} руб. | {ad} руб. |\n| Б | {bp} руб. | {"Бесплатно, если сумма товаров больше " + str(threshold) + " руб.; иначе " + str(bd) + " руб." if bd else "Бесплатно"} |\n| В | {cp} руб. | {cd} руб. |\n\nКакова наименьшая общая стоимость покупки вместе с доставкой?'
        explanation = f'Посчитаем полную стоимость: магазин А — \\({q}\\cdot{ap}+{ad}={costA}\\) руб.; магазин Б — \\({costB}\\) руб. с учётом условия доставки; магазин В — \\({q}\\cdot{cp}+{cd}={costC}\\) руб. Минимальная сумма — **{answer} руб.**'
    elif n == 7:
        # Practice on function graphs and the vertex of a parabola.
        h = rng.randint(-6, 6)
        k = rng.randint(-8, 15)
        a = rng.choice([1, 2, 3])
        xtext = f'(x-{h})' if h >= 0 else f'(x+{abs(h)})'
        answer = h
        statement = f'Функция задана формулой \\(f(x)=-{a}{xtext}^2+{k}\\). График функции — парабола с ветвями вниз. Найдите абсциссу её вершины.'
        explanation = f'Вершинная форма параболы: \\(f(x)=-{a}(x-({h}))^2+{k}\\). Вершина имеет абсциссу \\(x={h}\\), это и есть ответ.'
    elif n == 8:
        # Logical analysis of statements; answer is the ordered digit sequence of true statements.
        number = rng.randint(12, 99)
        divisor_a = rng.choice([2, 3, 5, 9])
        divisor_b = rng.choice([2, 3, 4, 5, 10])
        statements = [
            (f'Число {number} делится на {divisor_a}.', number % divisor_a == 0),
            (f'Число {number} больше 50.', number > 50),
            (f'Число {number} нечётное.', number % 2 == 1),
            (f'Число {number} делится на {divisor_b}.', number % divisor_b == 0),
        ]
        truth = [i + 1 for i, (_, ok) in enumerate(statements) if ok]
        if not truth:
            statements[0] = (f'Число {number} больше 10.', number > 10)
            truth = [1]
        answer = ''.join(map(str, truth))
        statement = 'Даны четыре утверждения. Запишите номера всех верных утверждений подряд, без пробелов.\n\n' + '\n'.join(f'{i+1}) {txt}' for i, (txt, _) in enumerate(statements))
        explanation = 'Проверим утверждения по очереди. ' + '; '.join(f'{i+1}) «{txt}» — ' + ('верно' if ok else 'неверно') for i, (txt, ok) in enumerate(statements)) + f'. Верные номера: **{answer}**.'
    elif n == 9:
        a,b = rng.randint(6,15), rng.randint(5,12)
        c,d = rng.randint(1,a-2), rng.randint(1,b-2)
        answer=a*b-c*d
        statement=f'Фигура изображена на квадратной решётке с клетками 1 м × 1 м. Её можно получить из прямоугольника размером {a} × {b} клеток, если убрать из угла прямоугольник размером {c} × {d} клетки. Найдите площадь оставшейся фигуры в квадратных метрах.'
        explanation=f'Площадь исходного прямоугольника равна \\({a}\\cdot{b}={a*b}\\). Площадь убранной части равна \\({c}\\cdot{d}={c*d}\\). Остаётся \\({a*b}-{c*d}={answer}\\) м².'
    elif n == 10:
        a,b = rng.randint(12,25),rng.randint(10,20)
        c,d=rng.randint(3,a-2),rng.randint(2,b-2)
        answer=a*b-c*d
        statement=f'Участок имеет форму прямоугольника размером {a} м на {b} м. На нём стоит прямоугольный сарай размером {c} м на {d} м. Найдите площадь участка, не занятую сараем, в квадратных метрах.'
        explanation=f'Площадь участка: \\({a}\\cdot{b}={a*b}\\) м². Площадь сарая: \\({c}\\cdot{d}={c*d}\\) м². Незанятая площадь: \\({a*b}-{c*d}={answer}\\) м².'
    elif n == 11:
        a,b,h=rng.randint(10,30),rng.randint(10,25),rng.randint(2,8)
        answer=a*b*h
        statement=f'В прямоугольном баке с основанием {a} см на {b} см уровень воды после полного погружения детали поднялся на {h} см. Найдите объём детали в кубических сантиметрах. Считайте, что вода не перелилась через край.'
        explanation=f'Объём вытесненной воды равен площади основания бака, умноженной на подъём уровня: \\({a}\\cdot{b}\\cdot{h}={answer}\\) см³.'
    elif n == 12:
        a,b=rng.choice([(6,8),(8,10),(10,12),(12,16),(14,18),(16,20),(9,12),(12,15)])
        answer=a*b//2
        statement=f'Катеты прямоугольного треугольника равны {a} см и {b} см. Найдите площадь треугольника в квадратных сантиметрах.'
        explanation=f'Площадь прямоугольного треугольника равна половине произведения катетов: \\({a}\\cdot{b}/2={answer}\\) см².'
    elif n == 13:
        k=rng.randint(1,5); a=6*k; edge=5*k; height=4*k; answer=2*a*height
        statement=f'Правильная четырёхугольная пирамида имеет квадрат в основании со стороной {a} см. Каждое боковое ребро равно {edge} см. Найдите площадь боковой поверхности пирамиды в квадратных сантиметрах.'
        explanation=f'Высота боковой грани равна \\(\\sqrt{{{edge}^2-({a}/2)^2}}={height}\\) см. Четыре грани имеют суммарную площадь \\(4\\cdot\\frac12\\cdot{a}\\cdot{height}={answer}\\) см².'
    elif n == 14:
        a,b,c=rng.randint(1,20),rng.randint(2,9),rng.randint(2,9)
        answer=a+b*c
        statement=f'Найдите значение выражения \\({a}+{b}\\cdot{c}\\).'
        explanation=f'Сначала выполняем умножение: \\({b}\\cdot{c}={b*c}\\). Затем складываем: \\({a}+{b*c}={answer}\\).'
    elif n == 15:
        x,y=rng.randint(1,5),rng.randint(2,6); unit=rng.randint(4,18); total=(x+y)*unit; answer=y*unit
        statement=f'Общая площадь участка составляет {total} га. Две части распределили в отношении {x}:{y}. Сколько гектаров приходится на вторую часть?'
        explanation=f'Всего частей \\({x}+{y}={x+y}\\). Одна часть равна \\({total}/{x+y}={unit}\\) га. Вторая часть: \\({y}\\cdot{unit}={answer}\\) га.'
    elif n == 16:
        kind = rng.choice(['powers', 'roots', 'mixed', 'fraction'])
        if kind == 'powers':
            base = rng.choice([2, 3, 4, 5])
            m, q = rng.randint(1, 4), rng.randint(1, 4)
            r = rng.randint(0, min(3, m + q - 1))
            answer = base ** (m + q - r)
            statement = f'Найдите значение выражения \\(({base}^{m}\\cdot{base}^{q})/{base}^{r}\\).'
            explanation = f'При умножении степеней показатели складываются, а при делении вычитаются: \\(({base}^{m}\\cdot{base}^{q})/{base}^{r}={base}^{{{m}+{q}-{r}}}={answer}\\).'
        elif kind == 'roots':
            a, b = rng.randint(2, 12), rng.randint(2, 12)
            answer = a + b
            statement = f'Найдите значение выражения \\(\\sqrt{{{a*a}}}+\\sqrt{{{b*b}}}\\).'
            explanation = f'\\(\\sqrt{{{a*a}}}={a}\\), а \\(\\sqrt{{{b*b}}}={b}\\). Сумма равна \\({a}+{b}={answer}\\).'
        elif kind == 'mixed':
            a, b = rng.randint(2, 9), rng.randint(1, 8)
            answer = (a + b) ** 2 - a ** 2 - 2 * a * b
            statement = f'Найдите значение выражения \\(({a}+{b})^2-{a}^2-2\\cdot{a}\\cdot{b}\\).'
            explanation = f'Раскроем квадрат суммы: \\(({a}+{b})^2={a*a}+2\\cdot{a}\\cdot{b}+{b*b}\\). После сокращения остаётся \\({b*b}\\). Ответ: **{answer}**.'
        else:
            denominator = rng.choice([2, 4, 5, 10])
            numerator = rng.randint(1, denominator - 1)
            addend = rng.randint(1, 8)
            value = numerator / denominator + addend
            answer = fmt_decimal(value)
            statement = f'Найдите значение выражения \\({numerator}/{denominator}+{addend}\\). Ответ запишите десятичной дробью.'
            explanation = f'Сначала вычислим дробь \\({numerator}/{denominator}={fmt_decimal(numerator/denominator)}\\), затем прибавим {addend}. Получаем **{answer}**.'
    elif n == 17:
        x = rng.randint(-9, 12)
        a = rng.choice([2, 3, 4, 5, 6])
        b = rng.randint(-12, 12)
        c = a * x + b
        statement = f'Решите уравнение \\({a}x{b:+d}={c}\\). В ответ запишите корень.'
        explanation = f'Перенесём свободный член: \\({a}x={c}-({b})={a*x}\\). Разделим обе части на {a}: \\(x={x}\\). Ответ: **{x}**.'
    elif n == 18:
        vals=rng.sample([-2.4,-1.7,-1.2,-0.8,-0.3,0.4,0.9,1.3,1.8,2.5],4)
        order=sorted(range(4), key=lambda i: vals[i]); answer=''.join(str(i+1) for i in order)
        statement='Даны четыре значения:\n\n'+'\n'.join(f'{i+1}) {str(v).replace(".", ",")}' for i,v in enumerate(vals))+'\n\nРасположите значения слева направо на числовой прямой. Запишите номера в порядке возрастания значений подряд.'
        explanation='На числовой прямой значения располагаются в порядке возрастания. После сравнения чисел слева направо идут номера **'+' → '.join(answer)+'**; ответ без разделителей — **'+answer+'**.'
    elif n == 19:
        pairs=[(4,6),(6,10),(8,12),(9,12),(10,15),(12,18),(14,21),(16,20),(18,24),(15,20)]
        a,b=rng.choice(pairs); answer=math.lcm(a,b)
        statement=f'Найдите наименьшее натуральное число, которое делится без остатка и на {a}, и на {b}.'
        explanation=f'Разложим числа на множители и найдём наименьшее общее кратное. \\(\\operatorname{{НОК}}({a},{b})={answer}\\). Это наименьшее число, кратное обоим данным числам.'
    elif n == 20:
        for _ in range(100):
            v1,v2=rng.sample([40,50,60,70,80,90,100],2); t1,t2=rng.randint(1,4),rng.randint(1,4)
            dist1,dist2=v1*t1,v2*t2; tt=t1+t2
            if (dist1+dist2)%tt==0: break
        answer=(dist1+dist2)//tt
        statement=f'Автомобиль проехал первые {dist1} км со скоростью {v1} км/ч, а следующие {dist2} км — со скоростью {v2} км/ч. Найдите среднюю скорость автомобиля на всём пути в км/ч.'
        explanation=f'Время на первом участке: \\({dist1}/{v1}={t1}\\) ч; на втором: \\({dist2}/{v2}={t2}\\) ч. Средняя скорость равна всему пути, делённому на всё время: \\(({dist1}+{dist2})/({t1}+{t2})={answer}\\) км/ч.'
    elif n == 21:
        a,b,c,d=[rng.randint(3,15) for _ in range(4)]
        p1,p2,p3=2*(a+b),2*(c+b),2*(c+d); answer=2*(a+d)
        statement=f'Прямоугольник разделили вертикальным и горизонтальным разрезами на четыре меньших прямоугольника. Периметры верхнего левого, верхнего правого и нижнего правого прямоугольников равны соответственно {p1} см, {p2} см и {p3} см. Найдите периметр нижнего левого прямоугольника.'
        explanation=f'Обозначим ширины частей через a и c, а высоты — через b и d. При сложении периметров верхнего левого и нижнего правого прямоугольников и вычитании периметра верхнего правого получается периметр нижнего левого: \\({p1}+{p3}-{p2}={answer}\\) см.'
    else:
        raise ValueError(n)
    if isinstance(answer, float): answer = fmt_decimal(answer)
    # Avoid wording that labels generated tasks as official and maintain provenance in data.
    statement = statement + SOURCE_NOTE
    return {
        'externalId': f'math_basic_{n:02d}_generated_v{v}_2027_v1',
        'subjectId': 'math_basic', 'subjectName': 'Математика (база)', 'taskNumber': n,
        'title': f'{title0} · вариант {v}', 'statement': statement,
        'explanation': explanation, 'correctAnswer': str(answer), 'answerFormat': 'Краткий ответ',
        'taskType': typ, 'part': 1, 'difficulty': diff, 'keywords': keywords,
        'commonMistakes': mistakes[:3], 'isPremium': False, 'isVerified': False,
        'examYear': 2027, 'contentVersion': 2, 'sourceType': 'author_generated',
        'sourceLabel': 'Авторская задача', 'variantIndex': v
    }

# Keep the original 21 basic tasks and add twenty controlled variants of each question type.
new_data=[]
for t in data:
    if t.get('subjectId') == 'math_basic':
        if '_practice_' in t.get('externalId','') or (t.get('sourceType') == 'author_original' and int(t.get('variantIndex', 1)) == 1):
            t=dict(t)
            t['sourceType']='author_original'
            t['sourceLabel']='Авторская задача'
            t['variantIndex']=1
            new_data.append(t)
        # Existing generated variants are intentionally regenerated below.
    else:
        new_data.append(t)
for n, base in base_tasks.items():
    for v in range(2,22):
        new_data.append(variant_for(n,v,base))
# Keep dataset stable in grouping: profile samples are retained but basic bank begins with all task 1-21 variants.
new_data.sort(key=lambda t: (0 if t.get('subjectId')=='math_basic' else 1, int(t.get('taskNumber',0)), int(t.get('variantIndex', 0))))
# Ensure IDs unique and answers all populated for basic tasks.
ids=[t['externalId'] for t in new_data]
assert len(ids)==len(set(ids)), 'duplicate IDs'
basic=[t for t in new_data if t.get('subjectId')=='math_basic']
assert len(basic)==441, len(basic)
assert all(t.get('correctAnswer') not in (None,'') for t in basic)
assert {n:sum(t['taskNumber']==n for t in basic) for n in range(1,22)} == {n:21 for n in range(1,22)}
DATA.write_text(json.dumps(new_data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'Wrote {len(new_data)} tasks total, {len(basic)} basic; 21 tasks for each number 1-21.')
